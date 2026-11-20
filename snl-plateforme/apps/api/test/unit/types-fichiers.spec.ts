import { reconnaitreType } from '../../src/documents/types-fichiers';

describe('reconnaitreType', () => {
  const pdf = Buffer.from('%PDF-1.7\n...');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

  it('accepte un PDF dont le contenu est bien un PDF', () => {
    expect(reconnaitreType('bail.pdf', pdf)).toBe('application/pdf');
    expect(reconnaitreType('BAIL.PDF', pdf)).toBe('application/pdf');
  });

  it('refuse un exécutable renommé en PDF', () => {
    expect(reconnaitreType('facture.pdf', Buffer.from('MZ\x90\x00'))).toBeNull();
  });

  it('refuse une extension non autorisée même si le contenu est valide', () => {
    expect(reconnaitreType('script.html', pdf)).toBeNull();
  });

  it('refuse une image dont l’extension ne correspond pas au contenu', () => {
    expect(reconnaitreType('photo.jpg', png)).toBeNull();
    expect(reconnaitreType('photo.png', png)).toBe('image/png');
  });
});
