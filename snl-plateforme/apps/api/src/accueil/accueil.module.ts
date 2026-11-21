import { Module } from '@nestjs/common';
import { SocleModule } from '../socle.module';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';

/** Module M3 Accueil des bénévoles. */
@Module({
  imports: [SocleModule],
  controllers: [IntegrationController],
  providers: [IntegrationService],
  exports: [IntegrationService],
})
export class AccueilModule {}
