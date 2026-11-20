import { Module } from '@nestjs/common';
import { SocleModule } from '../socle.module';
import { ArtisansEntretiensService } from './artisans-entretiens.service';
import { InterventionsService } from './interventions.service';
import { TravauxController } from './travaux.controller';

/**
 * Module M1 Travaux et entretien. Il s'appuie sur le socle (droits, audit,
 * activation des modules, notifications) et ne touche qu'à ses propres tables,
 * hormis la lecture des logements.
 */
@Module({
  imports: [SocleModule],
  controllers: [TravauxController],
  providers: [InterventionsService, ArtisansEntretiensService],
})
export class TravauxModule {}
