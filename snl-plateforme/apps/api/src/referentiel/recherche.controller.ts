import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import type { PrincipalAssociation } from '../auth/principal';
import { Audite } from '../audit/audit.interceptor';
import { AutorisationService } from '../autorisation/autorisation.service';
import { PrincipalCourant } from '../commun/decorateurs';
import { normaliserNom } from '../commun/normalisation';
import { ValidationZod } from '../commun/validation-zod.pipe';
import { idsOrganisationsDuPerimetre } from '../organisations/organisations.service';
import { PrismaService } from '../prisma/prisma.service';

const schemaRecherche = z.object({ q: z.string().trim().min(2).max(80) });
const LIMITE = 20;

/**
 * Recherche transverse (M0-F09) : logements par référence, personnes par nom.
 * Chaque catégorie est filtrée par le périmètre de lecture correspondant, de
 * sorte qu'un bénévole ne trouve rien hors de son groupe.
 */
@Controller('recherche')
export class RechercheController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
  ) {}

  @Get()
  @Audite({ action: 'rechercher', entite: 'referentiel' })
  rechercher(
    @PrincipalCourant() principal: PrincipalAssociation,
    @Query(new ValidationZod(schemaRecherche)) { q }: z.infer<typeof schemaRecherche>,
  ) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const [idsLogements, idsPersonnes] = await Promise.all([
        idsOrganisationsDuPerimetre(tx, this.autorisation.perimetre(principal, 'logement:lire')),
        idsOrganisationsDuPerimetre(tx, this.autorisation.perimetre(principal, 'personne:lire')),
      ]);
      const nom = normaliserNom(q);

      const [logements, personnes] = await Promise.all([
        tx.logement.findMany({
          where: { organisationId: { in: idsLogements }, reference: { contains: q, mode: 'insensitive' } },
          select: { id: true, reference: true, typologie: true, organisationId: true },
          take: LIMITE,
        }),
        nom.length < 2
          ? Promise.resolve([])
          : tx.personne.findMany({
              where: { organisationId: { in: idsPersonnes }, supprimeLe: null, nomNormalise: { contains: nom } },
              select: { id: true, nom: true, prenom: true, organisationId: true, menageId: true },
              take: LIMITE,
            }),
      ]);
      return { logements, personnes };
    });
  }
}
