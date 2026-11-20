import type { Metadata } from 'next';
import { retourSur } from '@/lib/session';

export const metadata: Metadata = { title: 'Connexion' };

const MESSAGES: Record<string, { type: string; texte: string }> = {
  deconnecte: { type: 'alerte-succes', texte: 'Vous êtes déconnecté. À bientôt.' },
  expire: { type: 'alerte-info', texte: 'Votre session a expiré. Reconnectez-vous pour continuer.' },
  refus: { type: 'alerte-erreur', texte: 'La connexion a été annulée.' },
  etat: { type: 'alerte-erreur', texte: 'La connexion n’a pas pu être vérifiée. Recommencez, s’il vous plaît.' },
  jetons: { type: 'alerte-erreur', texte: 'Le service de connexion n’a pas répondu. Réessayez dans un instant.' },
};

export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const parametres = await searchParams;
  const cle = parametres.erreur ?? (parametres.deconnecte ? 'deconnecte' : parametres.expire ? 'expire' : null);
  const message = cle ? MESSAGES[cle] : null;
  const retour = retourSur(parametres.retour);

  return (
    <main id="contenu" className="page-centree">
      <div className="carte">
        <h1>Plateforme SNL</h1>
        <p className="chapo">
          L’espace de travail des bénévoles et des salariés de Solidarités Nouvelles pour le Logement.
        </p>
        {message ? (
          <div className={`alerte ${message.type}`} role="status">
            <p>{message.texte}</p>
          </div>
        ) : null}
        <p>
          <a className="bouton" href={`/auth/connexion?retour=${encodeURIComponent(retour)}`}>
            Se connecter
          </a>
        </p>
        <p className="aide">
          L’accès se fait sur invitation. Si vous n’avez pas encore de compte, demandez-le au coordinateur de votre
          groupe local.
        </p>
      </div>
    </main>
  );
}
