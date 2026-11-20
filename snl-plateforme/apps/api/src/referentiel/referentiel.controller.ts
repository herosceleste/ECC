import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import type { PrincipalAssociation } from '../auth/principal';
import { Audite } from '../audit/audit.interceptor';
import { PrincipalCourant } from '../commun/decorateurs';
import { ValidationZod } from '../commun/validation-zod.pipe';
import { LogementsService } from './logements.service';
import { PersonnesService } from './personnes.service';

const texte = (max: number) => z.string().trim().min(1).max(max);
const STATUTS = ['DISPONIBLE', 'OCCUPE', 'EN_TRAVAUX', 'HORS_PARC'] as const;

const schemaImmeuble = z.object({
  organisationId: z.uuid(),
  ligneAdresse: texte(200),
  codePostal: z.string().regex(/^\d{5}$/, 'code postal à 5 chiffres'),
  commune: texte(120),
});

const champsLogement = {
  immeubleId: z.uuid().nullable().optional(),
  reference: texte(40),
  typologie: z.string().regex(/^(T[1-9]|studio|chambre)$/i, 'T1 à T9, studio ou chambre'),
  surfaceM2: z.number().positive().max(1000).nullable().optional(),
  etage: z.number().int().min(-5).max(80).nullable().optional(),
  classeDpe: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']).nullable().optional(),
  statut: z.enum(STATUTS).optional(),
};
const schemaLogement = z.object({ organisationId: z.uuid(), ...champsLogement });
const schemaModifLogement = z.object(champsLogement).partial();
const schemaFiltreLogements = z.object({
  organisationId: z.uuid().optional(),
  statut: z.enum(STATUTS).optional(),
});

const schemaMenage = z.object({ organisationId: z.uuid(), libelle: texte(120) });
const schemaFiltreOrganisation = z.object({ organisationId: z.uuid().optional() });

const champsPersonne = {
  menageId: z.uuid().nullable().optional(),
  nom: texte(100),
  prenom: texte(100),
  dateNaissance: z.coerce.date().max(new Date(), 'date future').nullable().optional(),
  telephone: z.string().trim().max(30).nullable().optional(),
  email: z.email().max(254).nullable().optional(),
};
const schemaPersonne = z.object({
  organisationId: z.uuid(),
  ...champsPersonne,
  confirmerMalgreDoublon: z.boolean().default(false),
});
const schemaModifPersonne = z.object(champsPersonne).partial();
const schemaDonneesSensibles = z.record(z.string().max(60), z.unknown()).refine(
  (v) => JSON.stringify(v).length <= 20_000,
  'données trop volumineuses',
);

@Controller()
export class ReferentielController {
  constructor(
    private readonly logements: LogementsService,
    private readonly personnes: PersonnesService,
  ) {}

  // --- Immeubles et logements ----------------------------------------------

  @Get('immeubles')
  listerImmeubles(@PrincipalCourant() p: PrincipalAssociation) {
    return this.logements.listerImmeubles(p);
  }

  @Post('immeubles')
  @Audite({ action: 'creer', entite: 'immeuble' })
  creerImmeuble(
    @PrincipalCourant() p: PrincipalAssociation,
    @Body(new ValidationZod(schemaImmeuble)) corps: z.infer<typeof schemaImmeuble>,
  ) {
    return this.logements.creerImmeuble(p, corps);
  }

  @Get('logements')
  listerLogements(
    @PrincipalCourant() p: PrincipalAssociation,
    @Query(new ValidationZod(schemaFiltreLogements)) filtre: z.infer<typeof schemaFiltreLogements>,
  ) {
    return this.logements.lister(p, filtre);
  }

  @Get('logements/:id')
  @Audite({ action: 'consulter', entite: 'logement' })
  obtenirLogement(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.logements.obtenir(p, id);
  }

  @Post('logements')
  @Audite({ action: 'creer', entite: 'logement' })
  creerLogement(
    @PrincipalCourant() p: PrincipalAssociation,
    @Body(new ValidationZod(schemaLogement)) corps: z.infer<typeof schemaLogement>,
  ) {
    return this.logements.creer(p, corps);
  }

  @Patch('logements/:id')
  @Audite({ action: 'modifier', entite: 'logement' })
  modifierLogement(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaModifLogement)) corps: z.infer<typeof schemaModifLogement>,
  ) {
    return this.logements.modifier(p, id, corps);
  }

  // --- Ménages ---------------------------------------------------------------

  @Get('menages')
  listerMenages(
    @PrincipalCourant() p: PrincipalAssociation,
    @Query(new ValidationZod(schemaFiltreOrganisation)) filtre: z.infer<typeof schemaFiltreOrganisation>,
  ) {
    return this.personnes.listerMenages(p, filtre.organisationId);
  }

  @Get('menages/:id')
  @Audite({ action: 'consulter', entite: 'menage' })
  obtenirMenage(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.personnes.obtenirMenage(p, id);
  }

  @Post('menages')
  @Audite({ action: 'creer', entite: 'menage' })
  creerMenage(
    @PrincipalCourant() p: PrincipalAssociation,
    @Body(new ValidationZod(schemaMenage)) corps: z.infer<typeof schemaMenage>,
  ) {
    return this.personnes.creerMenage(p, corps);
  }

  // --- Personnes -------------------------------------------------------------

  @Get('personnes/:id')
  @Audite({ action: 'consulter', entite: 'personne' })
  obtenirPersonne(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.personnes.obtenir(p, id);
  }

  @Post('personnes')
  @Audite({ action: 'creer', entite: 'personne' })
  creerPersonne(
    @PrincipalCourant() p: PrincipalAssociation,
    @Body(new ValidationZod(schemaPersonne)) corps: z.infer<typeof schemaPersonne>,
  ) {
    const { confirmerMalgreDoublon, ...donnees } = corps;
    return this.personnes.creer(p, donnees, confirmerMalgreDoublon);
  }

  @Patch('personnes/:id')
  @Audite({ action: 'modifier', entite: 'personne' })
  modifierPersonne(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaModifPersonne)) corps: z.infer<typeof schemaModifPersonne>,
  ) {
    return this.personnes.modifier(p, id, corps);
  }

  @Delete('personnes/:id')
  @Audite({ action: 'supprimer', entite: 'personne' })
  supprimerPersonne(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.personnes.supprimer(p, id);
  }

  @Get('personnes/:id/donnees-sensibles')
  @Audite({ action: 'consulter-sensible', entite: 'personne' })
  lireSensibles(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.personnes.lireDonneesSensibles(p, id);
  }

  @Put('personnes/:id/donnees-sensibles')
  @Audite({ action: 'modifier-sensible', entite: 'personne' })
  ecrireSensibles(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaDonneesSensibles)) corps: Record<string, unknown>,
  ) {
    return this.personnes.ecrireDonneesSensibles(p, id, corps);
  }

  @Get('personnes/:id/export')
  @Audite({ action: 'exporter-rgpd', entite: 'personne' })
  exporter(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.personnes.exporter(p, id);
  }
}
