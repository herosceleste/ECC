import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { PrincipalAssociation } from '../auth/principal';
import { Audite } from '../audit/audit.interceptor';
import { PrincipalCourant } from '../commun/decorateurs';
import { ValidationZod } from '../commun/validation-zod.pipe';
import { ArtisansEntretiensService } from './artisans-entretiens.service';
import { InterventionsService } from './interventions.service';

const CATEGORIES = [
  'PLOMBERIE', 'ELECTRICITE', 'GAZ', 'CHAUFFAGE', 'MENUISERIE', 'SERRURERIE',
  'HUMIDITE', 'NUISIBLES', 'ELECTROMENAGER', 'PARTIES_COMMUNES', 'AUTRE',
] as const;
const STATUTS = ['NOUVEAU', 'QUALIFIE', 'PLANIFIE', 'EN_COURS', 'RESOLU', 'CLOS', 'ANNULE'] as const;

const schemaSignalement = z.object({
  logementId: z.uuid(),
  categorie: z.enum(CATEGORIES),
  description: z.string().trim().min(10, 'décrivez le problème en quelques mots (10 caractères au moins)').max(4000),
  urgenceSignalee: z.boolean().default(false),
});
const schemaFiltre = z.object({
  statut: z.enum(STATUTS).optional(),
  organisationId: z.uuid().optional(),
  logementId: z.uuid().optional(),
  mesAffectations: z.enum(['oui', 'non']).optional(),
});
const schemaQualification = z.object({
  priorite: z.enum(['URGENTE', 'HAUTE', 'NORMALE', 'BASSE']),
  nature: z.enum(['DEPANNAGE', 'ENTRETIEN', 'TRAVAUX']),
});
const schemaAffectation = z.object({
  utilisateurId: z.uuid().nullable().optional(),
  artisanId: z.uuid().nullable().optional(),
  datePrevue: z.coerce.date().nullable().optional(),
});
const schemaStatut = z.object({
  statut: z.enum(STATUTS),
  commentaire: z.string().trim().max(2000).optional(),
});
const schemaCommentaire = z.object({ texte: z.string().trim().min(1).max(2000) });
const schemaCout = z.object({
  type: z.enum(['DEVIS', 'FACTURE']),
  libelle: z.string().trim().min(2).max(200),
  montantCentimes: z.number().int().min(0).max(100_000_000),
});

const champsArtisan = {
  raisonSociale: z.string().trim().min(2).max(160),
  siret: z.string().regex(/^\d{14}$/, 'SIRET à 14 chiffres').nullable().optional(),
  specialites: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length),
  telephone: z.string().trim().max(30).nullable().optional(),
  email: z.email().max(254).nullable().optional(),
};
const schemaArtisan = z.object({ organisationId: z.uuid(), ...champsArtisan });
const schemaModifArtisan = z.object({ ...champsArtisan, actif: z.boolean() }).partial();

const schemaEntretien = z.object({
  logementId: z.uuid(),
  libelle: z.string().trim().min(2).max(160),
  categorie: z.enum(CATEGORIES),
  periodiciteMois: z.number().int().min(1).max(120),
  prochaineEcheance: z.coerce.date(),
});
const schemaEcheances = z.object({ jours: z.coerce.number().int().min(0).max(366).default(30) });
const schemaRealisation = z.object({ date: z.coerce.date().max(new Date(Date.now() + 86_400_000), 'date future') });

/** Routes du module M1 Travaux et entretien. */
@Controller('travaux')
export class TravauxController {
  constructor(
    private readonly interventions: InterventionsService,
    private readonly autres: ArtisansEntretiensService,
  ) {}

  @Post('interventions')
  @Audite({ action: 'signaler', entite: 'intervention' })
  signaler(@PrincipalCourant() p: PrincipalAssociation, @Body(new ValidationZod(schemaSignalement)) corps: z.infer<typeof schemaSignalement>) {
    return this.interventions.signaler(p, corps);
  }

  @Get('interventions')
  lister(@PrincipalCourant() p: PrincipalAssociation, @Query(new ValidationZod(schemaFiltre)) f: z.infer<typeof schemaFiltre>) {
    return this.interventions.lister(p, { ...f, mesAffectations: f.mesAffectations === 'oui' });
  }

  @Get('interventions/:id')
  @Audite({ action: 'consulter', entite: 'intervention' })
  obtenir(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.interventions.obtenir(p, id);
  }

  @Get('interventions/:id/affectables')
  affectables(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.interventions.affectables(p, id);
  }

  @Post('interventions/:id/qualification')
  @Audite({ action: 'qualifier', entite: 'intervention' })
  qualifier(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaQualification)) corps: z.infer<typeof schemaQualification>,
  ) {
    return this.interventions.qualifier(p, id, corps);
  }

  @Post('interventions/:id/affectation')
  @Audite({ action: 'affecter', entite: 'intervention' })
  affecter(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaAffectation)) corps: z.infer<typeof schemaAffectation>,
  ) {
    return this.interventions.affecter(p, id, corps);
  }

  @Post('interventions/:id/statut')
  @Audite({ action: 'changer-statut', entite: 'intervention' })
  statut(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaStatut)) corps: z.infer<typeof schemaStatut>,
  ) {
    return this.interventions.changerStatut(p, id, corps.statut, corps.commentaire);
  }

  @Post('interventions/:id/commentaires')
  @Audite({ action: 'commenter', entite: 'intervention' })
  commenter(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaCommentaire)) corps: z.infer<typeof schemaCommentaire>,
  ) {
    return this.interventions.commenter(p, id, corps.texte);
  }

  @Post('interventions/:id/couts')
  @Audite({ action: 'ajouter-cout', entite: 'intervention' })
  cout(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaCout)) corps: z.infer<typeof schemaCout>,
  ) {
    return this.interventions.ajouterCout(p, id, corps);
  }

  @Get('logements/:id/historique')
  historique(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.interventions.historiqueLogement(p, id);
  }

  @Get('artisans')
  artisans(@PrincipalCourant() p: PrincipalAssociation) {
    return this.autres.listerArtisans(p);
  }

  @Post('artisans')
  @Audite({ action: 'creer', entite: 'artisan' })
  creerArtisan(@PrincipalCourant() p: PrincipalAssociation, @Body(new ValidationZod(schemaArtisan)) corps: z.infer<typeof schemaArtisan>) {
    return this.autres.creerArtisan(p, corps);
  }

  @Patch('artisans/:id')
  @Audite({ action: 'modifier', entite: 'artisan' })
  modifierArtisan(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaModifArtisan)) corps: z.infer<typeof schemaModifArtisan>,
  ) {
    return this.autres.modifierArtisan(p, id, corps);
  }

  @Get('entretiens')
  echeances(@PrincipalCourant() p: PrincipalAssociation, @Query(new ValidationZod(schemaEcheances)) q: z.infer<typeof schemaEcheances>) {
    return this.autres.listerEcheances(p, q.jours);
  }

  @Post('entretiens')
  @Audite({ action: 'creer', entite: 'entretien' })
  creerEntretien(@PrincipalCourant() p: PrincipalAssociation, @Body(new ValidationZod(schemaEntretien)) corps: z.infer<typeof schemaEntretien>) {
    return this.autres.creerEntretien(p, corps);
  }

  @Post('entretiens/:id/realisation')
  @Audite({ action: 'realiser', entite: 'entretien' })
  realise(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaRealisation)) corps: z.infer<typeof schemaRealisation>,
  ) {
    return this.autres.marquerRealise(p, id, corps.date);
  }

  @Post('entretiens/:id/intervention')
  @Audite({ action: 'creer-intervention', entite: 'entretien' })
  interventionEntretien(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.autres.creerIntervention(p, id);
  }
}
