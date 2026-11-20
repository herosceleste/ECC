import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import type { PrincipalAssociation } from '../auth/principal';
import { Audite } from '../audit/audit.interceptor';
import { PrincipalCourant } from '../commun/decorateurs';
import { ValidationZod } from '../commun/validation-zod.pipe';
import { OrganisationsService } from './organisations.service';

const schemaCreation = z.object({
  parentId: z.uuid(),
  type: z.enum(['ANTENNE', 'GROUPE_LOCAL']),
  nom: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'minuscules, chiffres et tirets uniquement')
    .max(60),
});

const schemaRenommage = z.object({ nom: z.string().trim().min(2).max(120) });

@Controller('organisations')
export class OrganisationsController {
  constructor(private readonly service: OrganisationsService) {}

  @Get()
  lister(@PrincipalCourant() principal: PrincipalAssociation) {
    return this.service.lister(principal);
  }

  @Get(':id')
  @Audite({ action: 'consulter', entite: 'organisation' })
  obtenir(@PrincipalCourant() principal: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obtenir(principal, id);
  }

  @Post()
  @Audite({ action: 'creer', entite: 'organisation' })
  creer(
    @PrincipalCourant() principal: PrincipalAssociation,
    @Body(new ValidationZod(schemaCreation)) corps: z.infer<typeof schemaCreation>,
  ) {
    return this.service.creer(principal, corps);
  }

  @Patch(':id')
  @Audite({ action: 'modifier', entite: 'organisation' })
  renommer(
    @PrincipalCourant() principal: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaRenommage)) corps: z.infer<typeof schemaRenommage>,
  ) {
    return this.service.renommer(principal, id, corps.nom);
  }
}
