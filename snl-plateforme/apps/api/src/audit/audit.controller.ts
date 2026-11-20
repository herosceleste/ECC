import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import type { PrincipalAssociation } from '../auth/principal';
import { AutorisationService } from '../autorisation/autorisation.service';
import { PrincipalCourant } from '../commun/decorateurs';
import { ValidationZod } from '../commun/validation-zod.pipe';
import { idsOrganisationsDuPerimetre } from '../organisations/organisations.service';
import { PrismaService } from '../prisma/prisma.service';

const schemaFiltre = z.object({
  entiteType: z.string().max(40).optional(),
  entiteId: z.string().max(64).optional(),
  utilisateurId: z.uuid().optional(),
  depuis: z.coerce.date().optional(),
  jusqua: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const TAILLE_PAGE = 50;

/**
 * Consultation du journal d'audit (M0-F06). Un administrateur voit les
 * événements des organisations de son périmètre ; seul un administrateur de
 * l'association entière voit aussi les événements sans organisation.
 */
@Controller('audit')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
  ) {}

  @Get()
  lister(
    @PrincipalCourant() principal: PrincipalAssociation,
    @Query(new ValidationZod(schemaFiltre)) filtre: z.infer<typeof schemaFiltre>,
  ) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const perimetre = this.autorisation.perimetre(principal, 'audit:lire');
      if (perimetre.length === 0) {
        throw new ForbiddenException('La consultation du journal est réservée aux administrateurs.');
      }
      const ids = await idsOrganisationsDuPerimetre(tx, perimetre);
      const toutLAssociation = perimetre.includes(`/${principal.tenantId}/`);

      const evenements = await tx.evenementAudit.findMany({
        where: {
          OR: [{ organisationId: { in: ids } }, ...(toutLAssociation ? [{ organisationId: null }] : [])],
          entiteType: filtre.entiteType,
          entiteId: filtre.entiteId,
          utilisateurId: filtre.utilisateurId,
          horodatage: { gte: filtre.depuis, lte: filtre.jusqua },
        },
        orderBy: { horodatage: 'desc' },
        skip: (filtre.page - 1) * TAILLE_PAGE,
        take: TAILLE_PAGE,
      });
      return {
        page: filtre.page,
        taillePage: TAILLE_PAGE,
        evenements: evenements.map((e) => ({ ...e, id: e.id.toString() })),
      };
    });
  }
}
