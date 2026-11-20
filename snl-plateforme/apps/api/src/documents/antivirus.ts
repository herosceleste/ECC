import { Inject, Injectable } from '@nestjs/common';
import { connect } from 'node:net';
import { CONFIGURATION, type Configuration } from '../config/configuration';

export type ResultatAnalyse = { sain: true } | { sain: false; signature: string };

export abstract class Antivirus {
  /** Lève une erreur si l'analyse est impossible : on refuse alors le dépôt. */
  abstract analyser(contenu: Buffer): Promise<ResultatAnalyse>;
}

const TAILLE_BLOC = 64 * 1024;
const DELAI_MS = 30_000;

/**
 * Client minimal du protocole clamd (commande INSTREAM) : le fichier est
 * envoyé par blocs préfixés de leur longueur, terminés par un bloc vide.
 */
@Injectable()
export class AntivirusClamav extends Antivirus {
  constructor(@Inject(CONFIGURATION) private readonly config: Pick<Configuration, 'CLAMAV_HOTE' | 'CLAMAV_PORT'>) {
    super();
  }

  analyser(contenu: Buffer): Promise<ResultatAnalyse> {
    return new Promise((resoudre, rejeter) => {
      const socket = connect({ host: this.config.CLAMAV_HOTE, port: this.config.CLAMAV_PORT });
      const morceaux: Buffer[] = [];
      socket.setTimeout(DELAI_MS);

      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let debut = 0; debut < contenu.length; debut += TAILLE_BLOC) {
          const bloc = contenu.subarray(debut, debut + TAILLE_BLOC);
          const longueur = Buffer.alloc(4);
          longueur.writeUInt32BE(bloc.length, 0);
          socket.write(longueur);
          socket.write(bloc);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on('data', (d) => morceaux.push(d));
      socket.on('timeout', () => {
        socket.destroy();
        rejeter(new Error('Analyse antivirus trop longue.'));
      });
      socket.on('error', (e) => rejeter(new Error(`Antivirus injoignable : ${e.message}`)));
      socket.on('close', () => {
        const reponse = Buffer.concat(morceaux).toString('utf8').replace(/\0/g, '').trim();
        try {
          resoudre(interpreterReponseClamav(reponse));
        } catch (e) {
          rejeter(e);
        }
      });
    });
  }
}

/** « stream: OK » → sain ; « stream: Eicar-Signature FOUND » → infecté. */
export function interpreterReponseClamav(reponse: string): ResultatAnalyse {
  if (/:\s*OK$/.test(reponse)) return { sain: true };
  const trouve = /:\s*(.+)\s+FOUND$/.exec(reponse);
  if (trouve?.[1]) return { sain: false, signature: trouve[1] };
  throw new Error(`Réponse antivirus inattendue : ${reponse || '(vide)'}`);
}
