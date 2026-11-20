import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURATION, type Configuration } from '../config/configuration';

export abstract class Stockage {
  abstract deposer(cle: string, contenu: Buffer, typeMime: string, empreinteSha256: string): Promise<void>;
  /** URL signée, à durée courte, qui force le téléchargement. */
  abstract lienTemporaire(cle: string, nomFichier: string, dureeSecondes: number): Promise<string>;
}

/** Stockage objet compatible S3 (MinIO en local, prestataire européen en production). */
@Injectable()
export class StockageS3 extends Stockage {
  private readonly client: S3Client;

  constructor(@Inject(CONFIGURATION) private readonly config: Configuration) {
    super();
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
    });
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
      this.client,
      new GetObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: cle,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(nomSur)}`,
      }),
      { expiresIn: dureeSecondes },
    );
  }
}
