import { ForbiddenException, Injectable } from '@nestjs/common';
import { CODES_MODULES, MODULES, type CodeModule } from '@snl/shared';
import type { PrincipalAssociation } from '../auth/principal';
import { exigerSurOrganisation } from '../autorisation/acces';
import { AutorisationService } from '../autorisation/autorisation.service';
import { chargerOrganisation } from '../organisations/organisations.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';

export interface EtatModule {
  code: CodeModule;
  libelle: string;
  active: boolean;
  /** Organisation dont provient le réglage (elle-même ou un ancêtre), ou null par défaut. */
  regleSur: string | null;
}

/** Réglage d'activation trouvé sur une organisation de la lignée. */
export interface ReglageModule {
  organisationId: string;
  codeModule: string;
  active: boolean;
}

/**
 * Activation des modules par organisation (M0-F08, exigence T-12).
 * Le réglage le plus proche dans la lignée l'emporte : une antenne peut
 * activer un module pour tous ses groupes, et un groupe s'en retirer.
 * Sans aucun réglage, un module est désactivé.
 */
export function resoudreModules(lignee: string[], reglages: ReglageModule[]): EtatModule[] {
  return CODES_MODULES.map((code: CodeModule) => {
    for (let i = lignee.length - 1; i >= 0; i -= 1) {
      const reglage = reglages.find((r) => r.organisationId === lignee.at(i) && r.codeModule === code);
      if (reglage) {
        return { code, libelle: MODULES[code], active: reglage.active, regleSur: reglage.organisationId };
      }
    }
    return { code, libelle: MODULES[code], active: false, regleSur: null };
  });
}

/** « /a/b/c/ » → ['a', 'b', 'c'], de la racine vers l'organisation. */
export function ligneeDepuisChemin(chemin: string): string[] {
  return chemin.split('/').filter(Boolean);
}

@Injectable()
export class ModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
  ) {}

  lister(principal: PrincipalAssociation, organisationId: string): Promise<EtatModule[]> {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await exigerSurOrganisation(
        tx, this.autorisation, principal, 'organisation:lire', organisationId, 'organisation:lire', 'Organisation',
      );
      return this.etats(tx, organisationId);
    });
  }

  definir(
    principal: PrincipalAssociation,
    organisationId: string,
    code: CodeModule,
    active: boolean,
  ): Promise<EtatModule[]> {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await exigerSurOrganisation(
        tx, this.autorisation, principal, 'module:gerer', organisationId, 'organisation:lire', 'Organisation',
      );
      await tx.activationModule.upsert({
        where: { organisationId_codeModule: { organisationId, codeModule: code } },
        create: { tenantId: principal.tenantId, organisationId, codeModule: code, active },
        update: { active },
      });
      return this.etats(tx, organisationId);
    });
  }

  /** À appeler par chaque module métier avant de servir une requête. */
  async exigerActif(tx: Tx, organisationId: string, code: CodeModule): Promise<void> {
    const etat = (await this.etats(tx, organisationId)).find((e) => e.code === code);
    if (!etat?.active) {
      throw new ForbiddenException(`Le module « ${MODULES[code]} » n’est pas activé pour cette organisation.`);
    }
  }

  private async etats(tx: Tx, organisationId: string): Promise<EtatModule[]> {
    const organisation = await chargerOrganisation(tx, organisationId);
    const lignee = ligneeDepuisChemin(organisation.chemin);
    const reglages = await tx.activationModule.findMany({ where: { organisationId: { in: lignee } } });
    return resoudreModules(lignee, reglages);
  }
}
