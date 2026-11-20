import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ROLES, type Role } from '@snl/shared';
import { z } from 'zod';
import type { Principal, PrincipalAssociation } from '../auth/principal';
import { Audite } from '../audit/audit.interceptor';
import { PrincipalCourant, SansAssociation } from '../commun/decorateurs';
import { ValidationZod } from '../commun/validation-zod.pipe';
import { UtilisateursService } from './utilisateurs.service';

const schemaRole = z.enum(ROLES as unknown as [Role, ...Role[]]);

const schemaInvitation = z.object({
  email: z.email().max(254),
  nomAffiche: z.string().trim().min(2).max(120),
  organisationId: z.uuid(),
  role: schemaRole,
});

const schemaAdhesion = z.object({ organisationId: z.uuid(), role: schemaRole });
const schemaFiltre = z.object({ organisationId: z.uuid().optional() });

@Controller()
export class UtilisateursController {
  constructor(private readonly service: UtilisateursService) {}

  @Get('moi')
  @SansAssociation()
  moi(@PrincipalCourant() principal: Principal) {
    return this.service.moi(principal);
  }

  @Get('moi/espaces')
  @SansAssociation()
  espaces(@PrincipalCourant() principal: Principal) {
    return this.service.espaces(principal);
  }

  @Get('utilisateurs')
  lister(
    @PrincipalCourant() principal: PrincipalAssociation,
    @Query(new ValidationZod(schemaFiltre)) filtre: z.infer<typeof schemaFiltre>,
  ) {
    return this.service.lister(principal, filtre.organisationId);
  }

  @Post('utilisateurs/invitations')
  @Audite({ action: 'inviter', entite: 'utilisateur' })
  inviter(
    @PrincipalCourant() principal: PrincipalAssociation,
    @Body(new ValidationZod(schemaInvitation)) corps: z.infer<typeof schemaInvitation>,
  ) {
    return this.service.inviter(principal, corps);
  }

  @Post('utilisateurs/:id/adhesions')
  @Audite({ action: 'attribuer-role', entite: 'utilisateur' })
  attribuer(
    @PrincipalCourant() principal: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaAdhesion)) corps: z.infer<typeof schemaAdhesion>,
  ) {
    return this.service.attribuerRole(principal, id, corps.organisationId, corps.role);
  }

  @Delete('adhesions/:id')
  @Audite({ action: 'retirer-role', entite: 'adhesion' })
  retirer(@PrincipalCourant() principal: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.retirerRole(principal, id);
  }

  @Post('utilisateurs/:id/suspension')
  @Audite({ action: 'suspendre', entite: 'utilisateur' })
  suspendre(@PrincipalCourant() principal: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.changerStatut(principal, id, true);
  }

  @Post('utilisateurs/:id/reactivation')
  @Audite({ action: 'reactiver', entite: 'utilisateur' })
  reactiver(@PrincipalCourant() principal: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.changerStatut(principal, id, false);
  }
}
