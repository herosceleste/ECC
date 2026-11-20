/**
 * Types de fichiers acceptés. Le type déclaré par le navigateur ne fait pas
 * foi : on vérifie la signature binaire (« nombre magique ») du contenu.
 */
interface TypeAccepte {
  mime: string;
  extensions: string[];
  signature: (b: Buffer) => boolean;
}

const commencePar = (b: Buffer, octets: number[], decalage = 0) =>
  octets.every((o, i) => b[decalage + i] === o);

const ZIP = (b: Buffer) => commencePar(b, [0x50, 0x4b, 0x03, 0x04]);

export const TYPES_ACCEPTES: readonly TypeAccepte[] = [
  { mime: 'application/pdf', extensions: ['pdf'], signature: (b) => commencePar(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'], signature: (b) => commencePar(b, [0xff, 0xd8, 0xff]) },
  { mime: 'image/png', extensions: ['png'], signature: (b) => commencePar(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  {
    mime: 'image/webp',
    extensions: ['webp'],
    signature: (b) => commencePar(b, [0x52, 0x49, 0x46, 0x46]) && commencePar(b, [0x57, 0x45, 0x42, 0x50], 8),
  },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['docx'], signature: ZIP },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extensions: ['xlsx'], signature: ZIP },
  { mime: 'application/vnd.oasis.opendocument.text', extensions: ['odt'], signature: ZIP },
  { mime: 'application/vnd.oasis.opendocument.spreadsheet', extensions: ['ods'], signature: ZIP },
];

/** Renvoie le type MIME reconnu, ou null si le fichier n'est pas accepté. */
export function reconnaitreType(nomFichier: string, contenu: Buffer): string | null {
  const extension = nomFichier.split('.').pop()?.toLowerCase() ?? '';
  const type = TYPES_ACCEPTES.find((t) => t.extensions.includes(extension));
  return type && type.signature(contenu) ? type.mime : null;
}
