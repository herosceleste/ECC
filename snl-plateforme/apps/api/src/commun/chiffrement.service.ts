import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CONFIGURATION, type Configuration } from '../config/configuration';

export interface ContenuChiffre {
  contenu: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  etiquette: Uint8Array<ArrayBuffer>;
}

/**
 * Chiffrement applicatif des données sensibles (AES-256-GCM).
 *
 * L'identifiant de la personne sert de donnée authentifiée associée : un
 * contenu recopié sur la fiche d'une autre personne ne se déchiffre pas.
 */
@Injectable()
export class ChiffrementService {
  private readonly cle: Buffer;

  constructor(@Inject(CONFIGURATION) config: Pick<Configuration, 'CLE_CHIFFREMENT_DONNEES'>) {
    this.cle = Buffer.from(config.CLE_CHIFFREMENT_DONNEES, 'base64');
    if (this.cle.length !== 32) {
      throw new Error('La clé de chiffrement doit faire 32 octets.');
    }
  }

  chiffrer(valeur: unknown, contexte: string): ContenuChiffre {
    const iv = randomBytes(12);
    const chiffreur = createCipheriv('aes-256-gcm', this.cle, iv);
    chiffreur.setAAD(Buffer.from(contexte, 'utf8'));
    const contenu = Buffer.concat([
      chiffreur.update(JSON.stringify(valeur), 'utf8'),
      chiffreur.final(),
    ]);
    return {
      contenu: Uint8Array.from(contenu),
      iv: Uint8Array.from(iv),
      etiquette: Uint8Array.from(chiffreur.getAuthTag()),
    };
  }

  dechiffrer<T = unknown>(donnees: ContenuChiffre, contexte: string): T {
    const dechiffreur = createDecipheriv('aes-256-gcm', this.cle, donnees.iv);
    dechiffreur.setAAD(Buffer.from(contexte, 'utf8'));
    dechiffreur.setAuthTag(donnees.etiquette);
    const clair = Buffer.concat([dechiffreur.update(donnees.contenu), dechiffreur.final()]);
    return JSON.parse(clair.toString('utf8')) as T;
  }
}
