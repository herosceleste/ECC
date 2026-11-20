import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, from, mergeMap, Observable, throwError } from 'rxjs';
import type { RequeteAuthentifiee } from '../commun/decorateurs';
import { AuditService } from './audit.service';

export interface OptionsAudit {
  /** Verbe métier : « consulter », « creer », « modifier », « supprimer »… */
  action: string;
  /** Type d'entité concernée : « personne », « logement »… */
  entite: string;
  /** Paramètre de route portant l'identifiant (par défaut « id »). */
  parametre?: string;
}

const CLE_AUDIT = 'snl:audit';

/** Marque une route dont chaque appel, réussi ou refusé, est journalisé. */
export const Audite = (options: OptionsAudit): MethodDecorator => SetMetadata(CLE_AUDIT, options);

/**
 * Écrit un événement d'audit après chaque appel d'une route @Audite().
 * Si l'écriture échoue, la réponse échoue aussi : aucune consultation de
 * donnée personnelle ne doit rester hors du journal.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(contexte: ExecutionContext, suite: CallHandler): Observable<unknown> {
    const options = this.reflector.get<OptionsAudit | undefined>(CLE_AUDIT, contexte.getHandler());
    const requete = contexte.switchToHttp().getRequest<RequeteAuthentifiee>();
    const principal = requete.principal;
    if (!options || !principal?.tenantId) return suite.handle();

    const tenantId = principal.tenantId;
    const base = {
      tenantId,
      utilisateurId: principal.utilisateurId,
      action: options.action,
      entiteType: options.entite,
      adresseIp: requete.ip,
    };
    const brut: unknown = requete.params?.[options.parametre ?? 'id'];
    const idParametre = typeof brut === 'string' ? brut : undefined;

    return suite.handle().pipe(
      mergeMap((reponse) => {
        const objet = (reponse ?? {}) as { id?: unknown; organisationId?: unknown };
        return from(
          this.audit
            .enregistrer({
              ...base,
              entiteId: idParametre ?? (typeof objet.id === 'string' ? objet.id : undefined),
              organisationId: typeof objet.organisationId === 'string' ? objet.organisationId : undefined,
              resultat: 'SUCCES',
            })
            .then(() => reponse),
        );
      }),
      catchError((erreur: unknown) => {
        const statut = erreur instanceof HttpException ? erreur.getStatus() : 500;
        const resultat = [401, 403, 404].includes(statut) ? 'REFUS' : 'ERREUR';
        return from(
          this.audit.enregistrer({
            ...base,
            entiteId: idParametre,
            resultat,
            details: { statut },
          }),
        ).pipe(mergeMap(() => throwError(() => erreur)));
      }),
    );
  }
}
