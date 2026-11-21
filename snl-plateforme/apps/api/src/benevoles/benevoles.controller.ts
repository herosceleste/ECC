import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import type { PrincipalAssociation } from '../auth/principal';
import { Audite } from '../audit/audit.interceptor';
import { PrincipalCourant } from '../commun/decorateurs';
import { ValidationZod } from '../commun/validation-zod.pipe';
import { ActivitesService } from './activites.service';
import { EquipeService } from './equipe.service';

const heure = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'heure au format HH:MM');
const liste = z.array(z.string().trim().min(1).max(60)).max(20);

const schemaProfil = z.object({
  telephone: z.string().trim().max(30).nullable().optional(),
  telephoneMasque: z.boolean().optional(),
  competences: liste.optional(),
  centresInteret: liste.optional(),
  dateArrivee: z.coerce.date().nullable().optional(),
});
const schemaDisponibilite = z.object({
  jourSemaine: z.number().int().min(1).max(7).nullable().optional(),
  date: z.coerce.date().nullable().optional(),
  heureDebut: heure,
  heureFin: heure,
  commentaire: z.string().trim().max(200).nullable().optional(),
});
const schemaActivite = z.object({
  organisationId: z.uuid(),
  type: z.enum(['VISITE', 'CHANTIER', 'PERMANENCE', 'REUNION', 'FORMATION', 'AUTRE']),
  titre: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  lieu: z.string().trim().max(200).nullable().optional(),
  debut: z.coerce.date(),
  fin: z.coerce.date(),
  places: z.number().int().min(1).max(500).nullable().optional(),
  interventionId: z.uuid().nullable().optional(),
});
const schemaPeriode = z.object({
  du: z.coerce.date().optional(),
  au: z.coerce.date().optional(),
  organisationId: z.uuid().optional(),
});
const schemaReferent = z.object({ utilisateurId: z.uuid() });
const schemaFiltre = z.object({ organisationId: z.uuid().optional() });

/** Routes du module M2 Coordination des bénévoles. */
@Controller('benevoles')
export class BenevolesController {
  constructor(
    private readonly equipe: EquipeService,
    private readonly activites: ActivitesService,
  ) {}

  @Get('annuaire')
  annuaire(@PrincipalCourant() p: PrincipalAssociation, @Query(new ValidationZod(schemaFiltre)) f: z.infer<typeof schemaFiltre>) {
    return this.equipe.annuaire(p, f.organisationId);
  }

  @Get('moi/profil')
  monProfil(@PrincipalCourant() p: PrincipalAssociation) {
    return this.equipe.monProfil(p);
  }

  @Put('moi/profil')
  @Audite({ action: 'modifier', entite: 'profil-benevole' })
  modifierProfil(@PrincipalCourant() p: PrincipalAssociation, @Body(new ValidationZod(schemaProfil)) corps: z.infer<typeof schemaProfil>) {
    return this.equipe.modifierMonProfil(p, corps);
  }

  @Post('moi/disponibilites')
  ajouterDisponibilite(
    @PrincipalCourant() p: PrincipalAssociation,
    @Body(new ValidationZod(schemaDisponibilite)) corps: z.infer<typeof schemaDisponibilite>,
  ) {
    return this.equipe.ajouterDisponibilite(p, corps);
  }

  @Delete('moi/disponibilites/:id')
  supprimerDisponibilite(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.equipe.supprimerDisponibilite(p, id);
  }

  @Get('moi/menages')
  mesMenages(@PrincipalCourant() p: PrincipalAssociation) {
    return this.equipe.mesMenages(p);
  }

  @Get('moi/agenda.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  agenda(@PrincipalCourant() p: PrincipalAssociation) {
    return this.activites.monAgenda(p);
  }

  @Get('menages/:id/referents')
  referents(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.equipe.referents(p, id);
  }

  @Post('menages/:id/referents')
  @Audite({ action: 'ajouter-referent', entite: 'menage' })
  ajouterReferent(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaReferent)) corps: z.infer<typeof schemaReferent>,
  ) {
    return this.equipe.ajouterReferent(p, id, corps.utilisateurId);
  }

  @Delete('referents/:id')
  @Audite({ action: 'retirer-referent', entite: 'referent' })
  retirerReferent(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.equipe.retirerReferent(p, id);
  }

  @Get('activites')
  lister(@PrincipalCourant() p: PrincipalAssociation, @Query(new ValidationZod(schemaPeriode)) f: z.infer<typeof schemaPeriode>) {
    return this.activites.lister(p, f);
  }

  @Get('activites/:id')
  obtenir(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.activites.obtenir(p, id);
  }

  @Post('activites')
  @Audite({ action: 'creer', entite: 'activite' })
  creer(@PrincipalCourant() p: PrincipalAssociation, @Body(new ValidationZod(schemaActivite)) corps: z.infer<typeof schemaActivite>) {
    return this.activites.creer(p, corps);
  }

  @Post('activites/:id/annulation')
  @Audite({ action: 'annuler', entite: 'activite' })
  annuler(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.activites.annuler(p, id);
  }

  @Post('activites/:id/inscription')
  @Audite({ action: 'inscrire', entite: 'activite' })
  inscrire(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.activites.inscrire(p, id);
  }

  @Post('activites/:id/desistement')
  @Audite({ action: 'desister', entite: 'activite' })
  desister(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.activites.desister(p, id);
  }
}
