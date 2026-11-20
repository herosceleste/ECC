import { ForbiddenException, Injectable } from '@nestjs/common';
import { permissionsDuRole, type Permission } from '@snl/shared';
import type { Principal } from '../auth/principal';

/**
 * Contrôle d'accès RBAC + périmètre (exigence T-04).
 *
 * Un rôle détenu sur une organisation s'applique à elle et à toutes ses
 * descendantes : un coordinateur d'antenne agit sur les groupes de l'antenne,
 * un bénévole d'un groupe ne voit rien des groupes voisins.
 */
@Injectable()
export class AutorisationService {
  /** Vrai si le principal détient `permission` sur l'organisation de chemin `cheminCible`. */
  peut(principal: Principal, permission: Permission, cheminCible: string): boolean {
    return principal.adhesions.some(
      (a) => couvre(a.chemin, cheminCible) && permissionsDuRole(a.role).includes(permission),
    );
  }

  /** Lève une erreur 403 si le principal n'a pas la permission. */
  exiger(principal: Principal, permission: Permission, cheminCible: string): void {
    if (!this.peut(principal, permission, cheminCible)) {
      throw new ForbiddenException('Vous n’avez pas les droits nécessaires pour cette action.');
    }
  }

  /**
   * Chemins racines sur lesquels le principal détient `permission`, sans
   * redondance : sert à filtrer les listes (« tout ce qui commence par… »).
   */
  perimetre(principal: Principal, permission: Permission): string[] {
    const chemins = principal.adhesions
      .filter((a) => permissionsDuRole(a.role).includes(permission))
      .map((a) => a.chemin)
      .sort((x, y) => x.length - y.length);
    return chemins.filter((c, i) => !chemins.slice(0, i).some((p) => couvre(p, c)));
  }
}

/** Vrai si l'organisation de chemin `parent` est `enfant` ou l'un de ses ancêtres. */
export function couvre(parent: string, enfant: string): boolean {
  return enfant.startsWith(parent);
}

/** Construit le filtre Prisma « chemin d'organisation dans le périmètre ». */
export function filtrePerimetre(chemins: string[]): { OR: { chemin: { startsWith: string } }[] } {
  return { OR: chemins.map((c) => ({ chemin: { startsWith: c } })) };
}
