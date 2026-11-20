import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Configuration } from './config/configuration';

/** Réglages HTTP communs à l'exécution réelle et aux tests de bout en bout. */
export function configurerApplication(app: INestApplication, config: Configuration): void {
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1); // derrière Traefik : l'adresse IP réelle vient de X-Forwarded-For
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '256kb' });
  app.use(helmet());
  app.enableCors({
    origin: config.CORS_ORIGINES,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Association'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.setGlobalPrefix('api/v1', { exclude: ['sante'] });
  app.enableShutdownHooks();
}
