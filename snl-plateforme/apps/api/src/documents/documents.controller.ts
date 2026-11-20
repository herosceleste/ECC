import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import type { PrincipalAssociation } from '../auth/principal';
import { Audite } from '../audit/audit.interceptor';
import { PrincipalCourant } from '../commun/decorateurs';
import { ValidationZod } from '../commun/validation-zod.pipe';
import { DocumentsService, TYPES_ENTITES, type FichierRecu } from './documents.service';

const schemaCible = z.object({
  entiteType: z.enum(TYPES_ENTITES),
  entiteId: z.uuid(),
});
const schemaDepot = schemaCible.extend({
  categorie: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, 'catégorie en minuscules, chiffres et tirets'),
});

/** Plafond de réception côté serveur, au-delà du maximum configurable. */
const PLAFOND_MULTER_OCTETS = 50 * 1024 * 1024;

@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Post()
  @Audite({ action: 'deposer', entite: 'document' })
  @UseInterceptors(
    FileInterceptor('fichier', { storage: memoryStorage(), limits: { fileSize: PLAFOND_MULTER_OCTETS, files: 1 } }),
  )
  deposer(
    @PrincipalCourant() p: PrincipalAssociation,
    @Body(new ValidationZod(schemaDepot)) meta: z.infer<typeof schemaDepot>,
    @UploadedFile() fichier: FichierRecu | undefined,
  ) {
    return this.service.deposer(p, meta, fichier);
  }

  @Get()
  lister(
    @PrincipalCourant() p: PrincipalAssociation,
    @Query(new ValidationZod(schemaCible)) cible: z.infer<typeof schemaCible>,
  ) {
    return this.service.lister(p, cible.entiteType, cible.entiteId);
  }

  @Get(':id/lien')
  @Audite({ action: 'telecharger', entite: 'document' })
  lien(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.lien(p, id);
  }

  @Delete(':id')
  @Audite({ action: 'supprimer', entite: 'document' })
  supprimer(@PrincipalCourant() p: PrincipalAssociation, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.supprimer(p, id);
  }
}
