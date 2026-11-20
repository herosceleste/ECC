import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURATION, type Configuration } from '../config/configuration';

export interface Invitation {
  email: string;
  nomAffiche: string;
  /** Impose la configuration d'un second facteur dès la première connexion. */
  exigerSecondFacteur: boolean;
}

/** Création des comptes dans le fournisseur d'identité (Keycloak). */
export abstract class FournisseurIdentite {
  abstract inviter(invitation: Invitation): Promise<void>;
}

/**
 * Crée le compte dans Keycloak puis lui envoie un courriel d'actions
 * (choix du mot de passe, vérification de l'adresse, second facteur).
 * Le lien est à usage unique et expire après 72 heures (M0-F01).
 */
@Injectable()
export class FournisseurKeycloak extends FournisseurIdentite {
  private readonly journal = new Logger('Keycloak');
  private static readonly DUREE_LIEN_SECONDES = 72 * 3600;

  constructor(@Inject(CONFIGURATION) private readonly config: Configuration) {
    super();
  }

  async inviter(invitation: Invitation): Promise<void> {
    const { KEYCLOAK_ADMIN_URL: base, KEYCLOAK_REALM: royaume } = this.config;
    if (!base || !this.config.KEYCLOAK_ADMIN_CLIENT_ID || !this.config.KEYCLOAK_ADMIN_CLIENT_SECRET) {
      this.journal.warn(
        `Keycloak non configuré : invitation de ${invitation.email} enregistrée sans envoi de courriel.`,
      );
      return;
    }

    const jeton = await this.jetonAdministration(base, royaume);
    const enTetes = { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' };
    const racine = `${base}/admin/realms/${encodeURIComponent(royaume)}`;

    const creation = await fetch(`${racine}/users`, {
      method: 'POST',
      headers: enTetes,
      body: JSON.stringify({
        username: invitation.email,
        email: invitation.email,
        firstName: invitation.nomAffiche,
        enabled: true,
        emailVerified: false,
      }),
    });
    if (!creation.ok && creation.status !== 409) {
      throw new Error(`Création du compte Keycloak refusée (${creation.status}).`);
    }

    const recherche = await fetch(
      `${racine}/users?exact=true&email=${encodeURIComponent(invitation.email)}`,
      { headers: enTetes },
    );
    const comptes = (await recherche.json()) as { id: string }[];
    const compte = comptes.at(0);
    if (!compte) throw new Error('Compte Keycloak introuvable après sa création.');

    const actions = ['VERIFY_EMAIL', 'UPDATE_PASSWORD'];
    if (invitation.exigerSecondFacteur) actions.push('CONFIGURE_TOTP');
    const parametres = new URLSearchParams({
      lifespan: String(FournisseurKeycloak.DUREE_LIEN_SECONDES),
      client_id: 'snl-web',
      redirect_uri: this.config.URL_PUBLIQUE_WEB,
    });
    const envoi = await fetch(`${racine}/users/${compte.id}/execute-actions-email?${parametres}`, {
      method: 'PUT',
      headers: enTetes,
      body: JSON.stringify(actions),
    });
    if (!envoi.ok) {
      throw new Error(`Envoi du courriel d'invitation refusé (${envoi.status}).`);
    }
  }

  private async jetonAdministration(base: string, royaume: string): Promise<string> {
    const reponse = await fetch(
      `${base}/realms/${encodeURIComponent(royaume)}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.KEYCLOAK_ADMIN_CLIENT_ID ?? '',
          client_secret: this.config.KEYCLOAK_ADMIN_CLIENT_SECRET ?? '',
        }),
      },
    );
    if (!reponse.ok) throw new Error(`Authentification auprès de Keycloak refusée (${reponse.status}).`);
    const corps = (await reponse.json()) as { access_token: string };
    return corps.access_token;
  }
}
