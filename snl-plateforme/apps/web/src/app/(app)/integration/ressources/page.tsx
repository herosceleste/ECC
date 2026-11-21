import type { Metadata } from 'next';
import { appelerApi } from '@/lib/api';
import { chargerMoi } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import type { ContenuAccueil } from '@/lib/types';
import { Corps, SousNavigationIntegration } from '../composants';

export const metadata: Metadata = { title: 'Fiches, questions et contacts' };

export default async function Ressources({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = ((await searchParams).q ?? '').trim();
  const [contenus, moi, resultats] = await Promise.all([
    appelerApi<ContenuAccueil[]>('/integration/contenus'),
    chargerMoi(),
    q.length >= 2 ? appelerApi<{ id: string; titre: string; corps: string }[]>(`/integration/faq?q=${encodeURIComponent(q)}`) : null,
  ]);
  const publies = contenus.filter((c) => c.publie);
  const parType = (type: string) => publies.filter((c) => c.type === type);
  const faq = resultats ?? parType('FAQ');

  return (
    <>
      <div className="titre-page">
        <h1>Bienvenue dans l’équipe</h1>
      </div>
      <SousNavigationIntegration actif="ressources" editeur={peut(moi.adhesions, 'accueil:editer')} />

      <div className="deux-colonnes">
        <div>
          <section aria-labelledby="titre-faq">
            <h2 id="titre-faq">Questions fréquentes</h2>
            <form method="get" role="search" className="actions" style={{ marginBottom: '1rem' }}>
              <label htmlFor="q-faq" className="visuellement-masque">
                Chercher une question
              </label>
              <input id="q-faq" name="q" type="search" defaultValue={q} minLength={2} placeholder="Ex. : fuite, clés, assurance…" style={{ flex: 1 }} />
              <button type="submit" className="bouton bouton-secondaire">
                Chercher
              </button>
            </form>
            {resultats ? (
              <p className="aide" role="status">
                {resultats.length === 0 ? `Aucune réponse pour « ${q} ».` : `${resultats.length} réponse(s) pour « ${q} ».`}
              </p>
            ) : null}
            {faq.map((f) => (
              <details key={f.id} className="carte">
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{f.titre}</summary>
                <Corps texte={f.corps} />
              </details>
            ))}
          </section>

          <section aria-labelledby="titre-fiches">
            <h2 id="titre-fiches">Fiches pratiques</h2>
            {parType('FICHE').length === 0 ? <p className="aide">Aucune fiche pour le moment.</p> : null}
            {parType('FICHE').map((f) => (
              <article key={f.id} className="carte" aria-labelledby={`fiche-${f.id}`}>
                <h3 id={`fiche-${f.id}`}>{f.titre}</h3>
                <Corps texte={f.corps} />
                {f.lienVideo ? (
                  <a href={f.lienVideo} target="_blank" rel="noopener noreferrer">
                    Voir la vidéo <span className="visuellement-masque">(nouvelle fenêtre)</span>
                  </a>
                ) : null}
              </article>
            ))}
          </section>
        </div>

        <section className="carte" aria-labelledby="titre-contacts">
          <h2 id="titre-contacts">Contacts utiles</h2>
          {parType('CONTACT').length === 0 ? <p className="aide">Aucun contact enregistré.</p> : null}
          {parType('CONTACT').map((c) => (
            <div key={c.id} style={{ marginBottom: '1rem' }}>
              <h3>{c.titre}</h3>
              <Corps texte={c.corps} />
              <p className="aide">{c.national ? 'Association' : c.portee}</p>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
