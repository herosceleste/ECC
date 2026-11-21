import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_SECOND_FACTEUR_OBLIGATOIRE } from '@snl/shared';
import { CONFIGURATION, type Configuration } from '../config/configuration';
import { CLE_PUBLIC, CLE_SANS_ASSOCIATION, type RequeteAuthentifiee } from '../commun/decorateurs';
import { PrismaService } from '../prisma/prisma.service';
import type { AdhesionPrincipal, Principal } from './principal';
import { VerificateurJeton, type JetonVerifie } from './verificateur-jeton';

export const EN_TETE_ASSOCIATION = 'x-association';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTERVALLE_MAJ_CONNEXION_MS = 60 * 60 * 1000;

/**
 * Garde globale : toute route est authentifiée sauf mention @Public().
 *
 * 1. Vérifie le jeton OIDC.
 * 2. Retrouve le compte, ou rattache le compte invité de même adresse lors de
 *    la première connexion. Aucune inscription libre n'est possible.
 * 3. Charge les rôles de l'utilisateur dans l'association choisie (en-tête
 *    X-Association), sauf sur les routes @SansAssociation().
 * 4. Exige le second facteur pour les rôles qui le requièrent (T-03).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly journal = new Logger('AuthGuard');

  constructor(
    private readonly reflector: Reflector,
    private readonly verificateur: VerificateurJeton,
    private readonly prisma: PrismaService,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  async canActivate(contexte: ExecutionContext): Promise<boolean> {
    const cibles = [contexte.getHandler(), contexte.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLE_PUBLIC, cibles)) return true;

    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
    const identite = await this.verifierJeton(requete.headers.authorization);
    const utilisateur = await this.retrouverUtilisateur(identite);

    const principal: Principal = {
      utilisateurId: utilisateur.id,
      sujet: identite.sujet,
      email: utilisateur.email,
      nomAffiche: utilisateur.nomAffiche,
      secondFacteur: identite.acr !== undefined && this.config.OIDC_ACR_SECOND_FACTEUR.includes(identite.acr),
      adhesions: [],
    };

    const sansAssociation = this.reflector.getAllAndOverride<boolean>(CLE_SANS_ASSOCIATION, cibles);
    const enTete = requete.headers[EN_TETE_ASSOCIATION];
    const tenantId = Array.isArray(enTete) ? enTete[0] : enTete;

    if (tenantId !== undefined || !sansAssociation) {
      if (!tenantId || !UUID.test(tenantId)) {
        throw new BadRequestException('Indiquez l’association concernée dans l’en-tête X-Association.');
      }
      principal.tenantId = tenantId;
      principal.adhesions = await this.chargerAdhesions(tenantId, utilisateur.id);
      if (principal.adhesions.length === 0) {
        throw new ForbiddenException('Vous n’êtes membre d’aucune organisation de cette association.');
      }
      this.verifierSecondFacteur(principal);
    }

    requete.principal = principal;
    return true;
  }

  private async verifierJeton(autorisation: string | undefined): Promise<JetonVerifie> {
    const [schema, jeton] = (autorisation ?? '').split(' ');
    if (schema?.toLowerCase() !== 'bearer' || !jeton) {
      throw new UnauthorizedException('Authentification requise.');
    }
    try {
      return await this.verificateur.verifier(jeton);
    } catch (erreur) {
      this.journal.debug(`Jeton refusé : ${(erreur as Error).message}`);
      throw new UnauthorizedException('Session invalide ou expirée.');
    }
  }

  private async retrouverUtilisateur(identite: JetonVerifie) {
    let utilisateur = await this.prisma.utilisateur.findUnique({
      where: { sujetIdentite: identite.sujet },
    });

    if (!utilisateur) {
      // Première connexion d'une personne invitée : on rattache son identité.
      // Le rattachement est atomique (une seule requête conditionnelle), car la
      // première page envoie plusieurs appels simultanés : un seul rattache,
      // les autres retrouvent ensuite le compte par son sujet.
      await this.prisma.utilisateur.updateMany({
        where: { email: identite.email, sujetIdentite: null, statut: 'INVITE' },
        data: { sujetIdentite: identite.sujet, statut: 'ACTIF', derniereConnexion: new Date() },
      });
      utilisateur = await this.prisma.utilisateur.findUnique({ where: { sujetIdentite: identite.sujet } });
      if (!utilisateur) {
        throw new ForbiddenException(
          'Aucun compte ne correspond à cette identité. Demandez une invitation à votre coordinateur.',
        );
      }
    }

    if (utilisateur.statut === 'SUSPENDU') {
      throw new ForbiddenException('Ce compte est suspendu. Contactez votre coordinateur.');
    }

    const maintenant = Date.now();
    const derniere = utilisateur.derniereConnexion?.getTime() ?? 0;
    if (maintenant - derniere > INTERVALLE_MAJ_CONNEXION_MS) {
      await this.prisma.utilisateur.update({
        where: { id: utilisateur.id },
        data: { derniereConnexion: new Date(maintenant) },
      });
    }
    return utilisateur;
  }

  private chargerAdhesions(tenantId: string, utilisateurId: string): Promise<AdhesionPrincipal[]> {
    return this.prisma.dansAssociation(tenantId, async (tx) => {
      const lignes = await tx.adhesion.findMany({
        where: { utilisateurId },
        include: { organisation: { select: { chemin: true } } },
      });
      return lignes.map((l) => ({
        organisationId: l.organisationId,
        chemin: l.organisation.chemin,
        role: l.role,
      }));
    });
  }

  private verifierSecondFacteur(principal: Principal): void {
    if (!this.config.EXIGER_SECOND_FACTEUR || principal.secondFacteur) return;
    const exige = principal.adhesions.some((a) => ROLES_SECOND_FACTEUR_OBLIGATOIRE.includes(a.role));
    if (exige) {
      throw new ForbiddenException({
        message: 'Votre rôle exige une connexion avec un second facteur.',
        code: 'SECOND_FACTEUR_REQUIS',
      });
    }
  }
}
