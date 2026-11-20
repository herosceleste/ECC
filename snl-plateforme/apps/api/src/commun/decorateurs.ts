import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from '../auth/principal';

export const CLE_PUBLIC = 'snl:public';
export const CLE_SANS_ASSOCIATION = 'snl:sans-association';

/** Route accessible sans authentification (santé, par exemple). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(CLE_PUBLIC, true);

/** Route authentifiée qui n'exige pas le choix d'une association. */
export const SansAssociation = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CLE_SANS_ASSOCIATION, true);

export type RequeteAuthentifiee = Request & { principal?: Principal };

/** Injecte le principal authentifié dans un paramètre de contrôleur. */
export const PrincipalCourant = createParamDecorator(
  (_donnees: unknown, ctx: ExecutionContext): Principal => {
    const requete = ctx.switchToHttp().getRequest<RequeteAuthentifiee>();
    if (!requete.principal) {
      throw new Error('Principal absent : la garde d’authentification n’a pas été appliquée.');
    }
    return requete.principal;
  },
);
