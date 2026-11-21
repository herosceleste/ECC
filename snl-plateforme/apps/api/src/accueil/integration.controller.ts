import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { PrincipalAssociation } from '../auth/principal';
import { Audite } from '../audit/audit.interceptor';
import { PrincipalCourant } from '../commun/decorateurs';
import { ValidationZod } from '../commun/validation-zod.pipe';
import { IntegrationService } from './integration.service';

const TYPES = ['ETAPE', 'FICHE', 'FAQ', 'CONTACT', 'ENGAGEMENT_CHARTE', 'ENGAGEMENT_CONFIDENTIALITE'] as const;
const champsContenu = {
  titre: z.string().trim().min(2).max(200),
  corps: z.string().trim().min(1).max(20_000),
  lienVideo: z.url().startsWith('https://', 'lien en https uniquement').max(500).nullable().optional(),
  ordre: z.number().int().min(0).max(1000).optional(),
  publie: z.boolean().optional(),
};
const schemaContenu = z.object({ organisationId: z.uuid(), type: z.enum(TYPES), ...champsContenu });
const schemaModif = z.object(champsContenu).partial();
const schemaFiltre = z.object({ type: z.enum(TYPES).optional() });
const schemaRecherche = z.object({ q: z.string().trim().min(2).max(100) });
const schemaEtape = z.object({ terminee: z.boolean() });
const schemaSignature = z.object({ empreinte: z.string().regex(/^[0-9a-f]{64}$/), accepte: z.literal(true) });
const schemaParrain = z.object({ organisationId: z.uuid(), filleulId: z.uuid(), parrainId: z.uuid() });
const schemaPoint = z.object({ date: z.coerce.date() });
const schemaTypeEngagement = z.enum(['ENGAGEMENT_CHARTE', 'ENGAGEMENT_CONFIDENTIALITE']);

/** Routes du module M3 Accueil des bénévoles. */
@Controller('integration')
export class IntegrationController {
  constructor(private readonly service: IntegrationService) {}

  @Get('contenus')
  contenus(@PrincipalCourant() p: PrincipalAssociation, @Query(new ValidationZod(schemaFiltre)) f: z.infer<typeof schemaFiltre>) {
    return this.service.contenus(p, f.type);
  }

  @Post('contenus')
  @Audite({ action: 'creer', entite: 'contenu-accueil' })
  creer(@PrincipalCourant() p: PrincipalAssociation, @Body(new ValidationZod(schemaContenu)) corps: z.infer<typeof schemaContenu>) {
    return this.service.creerContenu(p, corps);
  }

  @Patch('contenus/:id')
  @Audite({ action: 'modifier', entite: 'contenu-accueil' })
  modifier(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaModif)) corps: z.infer<typeof schemaModif>,
  ) {
    return this.service.modifierContenu(p, id, corps);
  }

  @Delete('contenus/:id')
  @Audite({ action: 'supprimer', entite: 'contenu-accueil' })
  supprimer(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.supprimerContenu(p, id);
  }

  @Get('faq')
  faq(@PrincipalCourant() p: PrincipalAssociation, @Query(new ValidationZod(schemaRecherche)) { q }: z.infer<typeof schemaRecherche>) {
    return this.service.rechercherFaq(p, q);
  }

  @Get('mon-parcours')
  monParcours(@PrincipalCourant() p: PrincipalAssociation) {
    return this.service.monParcours(p);
  }

  @Post('etapes/:id')
  etape(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaEtape)) corps: z.infer<typeof schemaEtape>,
  ) {
    return this.service.terminerEtape(p, id, corps.terminee);
  }

  @Get('engagements')
  engagements(@PrincipalCourant() p: PrincipalAssociation) {
    return this.service.engagements(p);
  }

  @Post('engagements/:type/signature')
  @Audite({ action: 'signer', entite: 'engagement', parametre: 'type' })
  signer(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('type', new ValidationZod(schemaTypeEngagement)) type: z.infer<typeof schemaTypeEngagement>,
    @Body(new ValidationZod(schemaSignature)) corps: z.infer<typeof schemaSignature>,
  ) {
    return this.service.signer(p, type, corps.empreinte);
  }

  @Get('suivi')
  suivi(@PrincipalCourant() p: PrincipalAssociation) {
    return this.service.suivi(p);
  }

  @Post('parrainages')
  @Audite({ action: 'designer-parrain', entite: 'parrainage' })
  parrain(@PrincipalCourant() p: PrincipalAssociation, @Body(new ValidationZod(schemaParrain)) corps: z.infer<typeof schemaParrain>) {
    return this.service.designerParrain(p, corps);
  }

  @Post('parrainages/:id/points')
  point(
    @PrincipalCourant() p: PrincipalAssociation,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationZod(schemaPoint)) corps: z.infer<typeof schemaPoint>,
  ) {
    return this.service.ajouterPoint(p, id, corps.date);
  }

  @Post('points/:id/fait')
  pointFait(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.marquerPointFait(p, id);
  }
}
