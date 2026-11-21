import { ForbiddenException, Injectable } from '@nestjs/common';
import type { TypeContenuAccueil } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Principal } from '../auth/principal';
import { ModulesService } from '../modules-plateforme/modules.service';
import type { Tx } from '../prisma/prisma.service';

export type TypeEngagement = Extract<TypeContenuAccueil, 'ENGAGEMENT_CHARTE' | 'ENGAGEMENT_CONFIDENTIALITE'>;

/**
 * Textes proposés tant que l'association n'a pas rédigé les siens. Ils sont
 * volontairement courts et doivent être relus par SNL avant le pilote.
 */
export const TEXTES_PAR_DEFAUT: Record<TypeEngagement, { titre: string; corps: string }> = {
  ENGAGEMENT_CONFIDENTIALITE: {
    titre: 'Engagement de confidentialité',
    corps:
      'En accompagnant des ménages logés par SNL, j’ai accès à des informations sur leur vie privée.\n\n' +
      'Je m’engage à :\n' +
      '- ne consulter que les informations nécessaires à ma mission ;\n' +
      '- ne jamais les communiquer à une personne extérieure à l’association ;\n' +
      '- ne pas les copier en dehors de la plateforme (photos d’écran, carnets, messageries) ;\n' +
      '- signaler sans attendre toute perte ou divulgation à mon coordinateur.\n\n' +
      'Cet engagement vaut pendant toute ma mission et après sa fin.',
  },
  ENGAGEMENT_CHARTE: {
    titre: 'Charte du bénévole',
    corps:
      'Je rejoins SNL pour aider des personnes à accéder à un logement digne et à reprendre pied.\n\n' +
      'Je m’engage à respecter les personnes accompagnées, leurs choix et leur rythme, à agir en lien avec mon ' +
      'groupe local et les travailleurs sociaux, et à prévenir mon coordinateur si je ne peux plus assurer une mission.',
  },
};

export const CODE_ENGAGEMENT_REQUIS = 'ENGAGEMENT_CONFIDENTIALITE_REQUIS';

export interface TexteEngagement {
  type: TypeEngagement;
  titre: string;
  corps: string;
  empreinte: string;
  parDefaut: boolean;
}

/**
 * Règle M3-R01 : quand le module M3 est activé pour une organisation, ses
 * données de ménages ne sont accessibles qu'après la signature de
 * l'engagement de confidentialité en vigueur. Si le texte change, chacun
 * doit signer la nouvelle version.
 */
@Injectable()
export class ConfidentialiteService {
  constructor(private readonly modules: ModulesService) {}

  /** Texte en vigueur : celui de l'association (contenu national), sinon le texte par défaut. */
  async texteCourant(tx: Tx, tenantId: string, type: TypeEngagement): Promise<TexteEngagement> {
    const contenu = await tx.contenuAccueil.findFirst({
      where: { organisationId: tenantId, type, publie: true },
      orderBy: { modifieLe: 'desc' },
    });
    const texte = contenu ? { titre: contenu.titre, corps: contenu.corps } : TEXTES_PAR_DEFAUT[type];
    return { type, ...texte, empreinte: empreinte(texte.titre, texte.corps), parDefaut: !contenu };
  }

  async aSigne(tx: Tx, tenantId: string, utilisateurId: string, type: TypeEngagement): Promise<boolean> {
    const texte = await this.texteCourant(tx, tenantId, type);
    const signature = await tx.engagementSigne.findFirst({
      where: { utilisateurId, type, empreinte: texte.empreinte },
    });
    return Boolean(signature);
  }

  /** Lève une erreur 403 explicite si l'engagement est requis et non signé. */
  async exiger(tx: Tx, principal: Principal & { tenantId: string }, organisationId: string): Promise<void> {
    if (!(await this.estRequis(tx, organisationId))) return;
    if (await this.aSigne(tx, principal.tenantId, principal.utilisateurId, 'ENGAGEMENT_CONFIDENTIALITE')) return;
    throw new ForbiddenException({
      message: 'Signez l’engagement de confidentialité pour accéder aux informations des ménages.',
      code: CODE_ENGAGEMENT_REQUIS,
    });
  }

  /**
   * Parmi des organisations, celles dont les données de ménages restent
   * fermées au principal faute de signature (pour filtrer une liste).
   */
  async organisationsFermees(tx: Tx, principal: Principal & { tenantId: string }, organisationIds: string[]): Promise<Set<string>> {
    const avecM3 = await this.modules.organisationsAvecModule(tx, organisationIds, 'M3');
    if (avecM3.length === 0) return new Set();
    const signe = await this.aSigne(tx, principal.tenantId, principal.utilisateurId, 'ENGAGEMENT_CONFIDENTIALITE');
    return signe ? new Set() : new Set(avecM3);
  }

  private async estRequis(tx: Tx, organisationId: string): Promise<boolean> {
    return (await this.modules.organisationsAvecModule(tx, [organisationId], 'M3')).length > 0;
  }
}

export function empreinte(titre: string, corps: string): string {
  return createHash('sha256').update(`${titre}\n\n${corps}`, 'utf8').digest('hex');
}
