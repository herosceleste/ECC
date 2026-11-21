import type { Metadata } from 'next';
import { BoutonEnvoi, Formulaire } from '@/composants/formulaire';
import { appelerApi } from '@/lib/api';
import { chargerMoi } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import type { TexteEngagement } from '@/lib/types';
import { signerEngagement } from '../actions';
import { Corps, SousNavigationIntegration } from '../composants';

export const metadata: Metadata = { title: 'Charte et engagements' };

export default async function Engagements({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ retour, signe }, textes, moi] = await Promise.all([
    searchParams,
    appelerApi<TexteEngagement[]>('/integration/engagements'),
    chargerMoi(),
  ]);

  return (
    <>
      <div className="titre-page">
        <h1>Bienvenue dans l’équipe</h1>
      </div>
      <SousNavigationIntegration actif="engagements" editeur={peut(moi.adhesions, 'accueil:editer')} />
      {signe ? (
        <div className="alerte alerte-succes" role="status">
          <p>Merci, votre signature est enregistrée.</p>
        </div>
      ) : null}

      {textes.map((t) => (
        <section key={t.type} className="carte" aria-labelledby={`texte-${t.type}`} style={{ maxWidth: '46rem' }}>
          <div className="titre-page">
            <h2 id={`texte-${t.type}`} style={{ margin: 0 }}>
              {t.titre}
            </h2>
            {t.signe ? <span className="badge badge-succes">Signé</span> : <span className="badge badge-alerte">À signer</span>}
          </div>
          <Corps texte={t.corps} />
          {t.signe ? null : (
            <Formulaire action={signerEngagement} libelle={`Signer : ${t.titre}`}>
              <input type="hidden" name="type" value={t.type} />
              <input type="hidden" name="empreinte" value={t.empreinte} />
              {retour ? <input type="hidden" name="retour" value={retour} /> : null}
              <label className="case">
                <input type="checkbox" name="accepte" value="oui" />
                J’ai lu ce texte et je m’engage à le respecter
              </label>
              <div className="actions">
                <BoutonEnvoi>Signer</BoutonEnvoi>
              </div>
            </Formulaire>
          )}
        </section>
      ))}
    </>
  );
}
