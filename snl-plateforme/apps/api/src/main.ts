import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurerApplication } from './application';
import { chargerConfiguration } from './config/configuration';

async function demarrer(): Promise<void> {
  const config = chargerConfiguration();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.avec(config), {
    bodyParser: false,
    logger: config.NODE_ENV === 'production' ? ['log', 'warn', 'error'] : undefined,
  });
  configurerApplication(app, config);
  await app.listen(config.PORT, '0.0.0.0');
  new Logger('Démarrage').log(`API SNL à l’écoute sur le port ${config.PORT}`);
}

demarrer().catch((erreur: unknown) => {
  // eslint-disable-next-line no-console
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exit(1);
});
