import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURATION, type Configuration } from '../config/configuration';

export abstract class Stockage {
  abstract deposer(cle: string, contenu: Buffer, typeMime: string, empreinteSha256: string): Promise<void>;
  /** URL signée, à durée courte, qui force le téléchargement. */
  abstract lienTemporaire(cle: string, nomFichier: string, dureeSecondes: number): Promise<string>;
}

/** Stockage objet compatible S3 (Garage en local, prestataire européen en production). */
@Injectable()
export class StockageS3 extends Stockage {
  private readonly client: S3Client;
  /** Client dédié à la signature des liens : la signature dépend de l'adresse. */
  private readonly clientPublic: S3Client;

  constructor(@Inject(CONFIGURATION) private readonly config: Configuration) {
    super();
    const options = (endpoint: string) =>
      new S3Client({
        endpoint,
        region: config.S3_REGION,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
        credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
        // Les stockages S3 tiers (Garage, Ceph…) n'acceptent pas tous les sommes de
        // contrôle que le SDK ajoute d'office ; on n'envoie que celles qu'on fournit.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    this.client = options(config.S3_ENDPOINT);
    this.clientPublic = options(config.S3_ENDPOINT_PUBLIC ?? config.S3_ENDPOINT);
  }

  async deposer(cle: string, contenu: Buffer, typeMime: string, empreinteSha256: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: cle,
        Body: contenu,
        ContentType: typeMime,
        ChecksumSHA256: Buffer.from(empreinteSha256, 'hex').toString('base64'),
      }),
    );
  }

  lienTemporaire(cle: string, nomFichier: string, dureeSecondes: number): Promise<string> {
    const nomSur = nomFichier.replace(/["\\\r\n]/g, '_');
    return getSignedUrl(
      this.clientPublic,
      new GetObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: cle,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(nomSur)}`,
      }),
      { expiresIn: dureeSecondes },
    );
  }
}
