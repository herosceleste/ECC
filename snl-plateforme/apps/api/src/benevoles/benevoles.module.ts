import { Module } from '@nestjs/common';
import { SocleModule } from '../socle.module';
import { ActivitesService } from './activites.service';
import { BenevolesController } from './benevoles.controller';
import { EquipeService } from './equipe.service';

/** Module M2 Coordination des bénévoles. */
@Module({
  imports: [SocleModule],
  controllers: [BenevolesController],
  providers: [EquipeService, ActivitesService],
  exports: [ActivitesService],
})
export class BenevolesModule {}
