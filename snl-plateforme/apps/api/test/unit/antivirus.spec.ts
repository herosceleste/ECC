import { createServer, type Server } from 'node:net';
import { AntivirusClamav, interpreterReponseClamav } from '../../src/documents/antivirus';

describe('interpreterReponseClamav', () => {
  it('reconnaît un fichier sain', () => {
    expect(interpreterReponseClamav('stream: OK')).toEqual({ sain: true });
  });

  it('reconnaît un fichier infecté et sa signature', () => {
    expect(interpreterReponseClamav('stream: Eicar-Test-Signature FOUND')).toEqual({
      sain: false,
      signature: 'Eicar-Test-Signature',
    });
  });

  it('lève une erreur sur une réponse inattendue', () => {
    expect(() => interpreterReponseClamav('INSTREAM size limit exceeded. ERROR')).toThrow();
  });
});

/** Faux clamd : relit le flux INSTREAM et répond selon son contenu. */
function fauxClamd(): Promise<{ serveur: Server; port: number; recus: Buffer[] }> {
  const recus: Buffer[] = [];
  return new Promise((resoudre) => {
    const serveur = createServer((socket) => {
      let tampon = Buffer.alloc(0);
      socket.on('data', (d) => {
        tampon = Buffer.concat([tampon, d]);
        const entete = Buffer.from('zINSTREAM\0');
        if (tampon.length < entete.length) return;
        let pos = entete.length;
        const morceaux: Buffer[] = [];
        while (pos + 4 <= tampon.length) {
          const longueur = tampon.readUInt32BE(pos);
          if (longueur === 0) {
            const fichier = Buffer.concat(morceaux);
            recus.push(fichier);
            socket.end(fichier.includes('EICAR') ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
            return;
          }
          if (pos + 4 + longueur > tampon.length) return;
          morceaux.push(tampon.subarray(pos + 4, pos + 4 + longueur));
          pos += 4 + longueur;
        }
      });
    });
    serveur.listen(0, '127.0.0.1', () => {
      const adresse = serveur.address();
      resoudre({ serveur, port: typeof adresse === 'object' && adresse ? adresse.port : 0, recus });
    });
  });
}

describe('AntivirusClamav (protocole INSTREAM)', () => {
  it('transmet le fichier par blocs et interprète la réponse', async () => {
    const { serveur, port, recus } = await fauxClamd();
    try {
      const av = new AntivirusClamav({ CLAMAV_HOTE: '127.0.0.1', CLAMAV_PORT: port });
      const gros = Buffer.alloc(150 * 1024, 7);
      await expect(av.analyser(gros)).resolves.toEqual({ sain: true });
      expect(recus[0]?.equals(gros)).toBe(true);
      await expect(av.analyser(Buffer.from('X5O!P%@AP EICAR test'))).resolves.toMatchObject({ sain: false });
    } finally {
      serveur.close();
    }
  });

  it('échoue si l’antivirus est injoignable, pour refuser le dépôt', async () => {
    const av = new AntivirusClamav({ CLAMAV_HOTE: '127.0.0.1', CLAMAV_PORT: 1 });
    await expect(av.analyser(Buffer.from('x'))).rejects.toThrow('Antivirus injoignable');
  });
});
