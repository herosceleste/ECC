import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController } from './audit/audit.controller';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditService } from './audit/audit.service';
import { AuthGuard } from './auth/auth.guard';
import { FournisseurIdentite, FournisseurKeycloak } from './auth/fournisseur-identite';
import { VerificateurJeton, VerificateurJetonOidc } from './auth/verificateur-jeton';
import { AutorisationService } from './autorisation/autorisation.service';
import { ChiffrementService } from './commun/chiffrement.service';
import { Antivirus, AntivirusClamav } from './documents/antivirus';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { Stockage, StockageS3 } from './documents/stockage';
import { Notificateur, NotificateurCourriel } from './notifications/notificateur';
import { ModulesController } from './modules-plateforme/modules.controller';
import { ModulesService } from './modules-plateforme/modules.service';
import { OrganisationsController } from './organisations/organisations.controller';
import { OrganisationsService } from './organisations/organisations.service';
import { PrismaService } from './prisma/prisma.service';
import { LogementsService } from './referentiel/logements.service';
import { PersonnesService } from './referentiel/personnes.service';
import { RechercheController } from './referentiel/recherche.controller';
import { ReferentielController } from './referentiel/referentiel.controller';
import { SanteController } from './sante/sante.controller';
import { UtilisateursController } from './utilisateurs/utilisateurs.controller';
import { UtilisateursService } from './utilisateurs/utilisateurs.service';

/**
 * Socle M0 : identité, droits, organisations, référentiel, documents, audit.
 * Les modules métier (M1 à M14) l'importeront pour réutiliser ces services.
 *
 * Les implémentations techniques (Keycloak, S3, ClamAV) sont fournies derrière
 * des classes abstraites : les tests les remplacent sans toucher au reste.
 */
@Module({
  controllers: [
    SanteController,
    UtilisateursController,
    OrganisationsController,
    ModulesController,
    ReferentielController,
    RechercheController,
    DocumentsController,
    AuditController,
  ],
  providers: [
    PrismaService,
    AutorisationService,
    AuditService,
    ChiffrementService,
    OrganisationsService,
    ModulesService,
    UtilisateursService,
    LogementsService,
    PersonnesService,
    DocumentsService,
    { provide: VerificateurJeton, useClass: VerificateurJetonOidc },
    { provide: FournisseurIdentite, useClass: FournisseurKeycloak },
    { provide: Antivirus, useClass: AntivirusClamav },
    { provide: Stockage, useClass: StockageS3 },
    { provide: Notificateur, useClass: NotificateurCourriel },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [PrismaService, AutorisationService, AuditService, ModulesService, ChiffrementService, Notificateur],
})
export class SocleModule {}
