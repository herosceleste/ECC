import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { CODES_MODULES, type CodeModule } from '@snl/shared';
import { z } from 'zod';
import type { PrincipalAssociation } from '../auth/principal';
import { Audite } from '../audit/audit.interceptor';
import { PrincipalCourant } from '../commun/decorateurs';
import { ValidationZod } from '../commun/validation-zod.pipe';
import { ModulesService } from './modules.service';

const schemaCode = z.enum(CODES_MODULES as [CodeModule, ...CodeModule[]]);
const schemaActivation = z.object({ active: z.boolean() });

@Controller('organisations/:id/modules')
export class ModulesController {
  constructor(private readonly service: ModulesService) {}

  @Get()
  lister(@PrincipalCourant() principal: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.lister(principal, id);
  }

  @Put(':code')
  @Audite({ action: 'modifier-modules', entite: 'organisation' })
  definir(
    @PrincipalCourant() principal: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('code', new ValidationZod(schemaCode)) code: CodeModule,
    @Body(new ValidationZod(schemaActivation)) corps: z.infer<typeof schemaActivation>,
  ) {
    return this.service.definir(principal, id, code, corps.active);
  }
}
