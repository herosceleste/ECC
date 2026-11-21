import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SectionDocuments } from '@/composants/documents';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { appelerApi, ErreurApi } from '@/lib/api';
import { chargerMoi, cheminsOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { dateCourte, dateHeure } from '@/lib/format';
import {
  ACTIONS_STATUT,
  CATEGORIES,
  euros,
  NATURES,
  NUMEROS_URGENCE,
  options,
  PRIORITES,
  STATUTS,
} from '@/lib/travaux';
import type { Affectables, EvenementIntervention, InterventionDetail } from '@/lib/types';
import { affecter, ajouterCout, changerStatut, commenter, qualifier } from '../actions';

export const metadata: Metadata = { title: 'Intervention' };

export default async function FicheIntervention({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, parametres] = await Promise.all([params, searchParams]);
  let intervention: InterventionDetail;
  try {
    intervention = await appelerApi<InterventionDetail>(`/travaux/interventions/${encodeURIComponent(id)}`);
  } catch (erreur) {
    if (erreur instanceof ErreurApi && [400, 403, 404].includes(erreur.statut)) notFound();
    throw erreur;
  }
  const { droits } = intervention;
  const [moi, chemins] = await Promise.all([chargerMoi(), cheminsOrganisations()]);
  // Chantier collectif (M1-F08) : proposé à qui coordonne les bénévoles du groupe.
  const organiserChantier =
    ['QUALIFIE', 'PLANIFIE', 'EN_COURS'].includes(intervention.statut) &&
    peut(moi.adhesions, 'benevoles:gerer', chemins.get(intervention.organisationId));
  const modifiable = ['NOUVEAU', 'QUALIFIE', 'PLANIFIE', 'EN_COURS'].includes(intervention.statut);
  const affectables =
    droits.gerer && modifiable
      ? await appelerApi<Affectables>(`/travaux/interventions/${intervention.id}/affectables`)
      : null;
  const urgent = intervention.priorite === 'URGENTE' && modifiable;
  const statut = STATUTS[intervention.statut];

  return (
    <>
      <nav className="fil-ariane" aria-label="Fil d’Ariane">
        <Link href="/travaux">Travaux</Link> › {CATEGORIES[intervention.categorie]}
      </nav>
      <div className="titre-page">
        <h1>{CATEGORIES[intervention.categorie] ?? intervention.categorie}</h1>
        <div className="actions">
          {intervention.priorite ? (
            <span className={`badge ${urgent ? 'badge-erreur' : ''}`}>Priorité {PRIORITES[intervention.priorite]?.toLowerCase()}</span>
          ) : null}
          <span className={`badge ${statut?.classe ?? ''}`}>{statut?.libelle}</span>
        </div>
      </div>

      {parametres.cree ? (
        <div className="alerte alerte-succes" role="status">
          <p>Le signalement est enregistré. Vous serez informé de chaque étape de son traitement.</p>
        </div>
      ) : null}
      {parametres.etape && STATUTS[parametres.etape] ? (
        <div className="alerte alerte-succes" role="status">
          <p>Le statut est mis à jour : {STATUTS[parametres.etape]?.libelle.toLowerCase()}.</p>
        </div>
      ) : null}
      {parametres.photos ? (
        <div className="alerte alerte-attention" role="status">
          <p>
            {parametres.photos === '1' ? 'Une photo n’a' : `${parametres.photos} photos n’ont`} pas pu être enregistrée(s).
            Vous pouvez les déposer de nouveau dans la rubrique Documents.
          </p>
        </div>
      ) : null}
      {urgent ? (
        <div className="alerte alerte-erreur" role={parametres.urgent ? 'alert' : undefined}>
          <p>
            <strong>Signalement urgent.</strong> Les coordinateurs et gestionnaires ont été alertés. En cas de danger
            immédiat, appelez sans attendre :
          </p>
          <ul>
            {NUMEROS_URGENCE.map((n) => (
              <li key={n.numero}>
                {n.libelle} : <a href={`tel:${n.tel}`}>{n.numero}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="deux-colonnes">
        <div>
          <section className="carte" aria-labelledby="titre-probleme">
            <h2 id="titre-probleme">Le problème</h2>
            <p style={{ whiteSpace: 'pre-line' }}>{intervention.description}</p>
            <dl className="liste-definitions">
              <dt>Logement</dt>
              <dd>
                {intervention.logement ? (
                  <Link href={`/logements/${intervention.logement.id}`}>{intervention.logement.reference}</Link>
                ) : (
                  '—'
                )}
              </dd>
              <dt>Signalé par</dt>
              <dd>
                {intervention.signaleParNom}, le {dateCourte(intervention.creeLe)}
              </dd>
              <dt>Nature</dt>
              <dd>{intervention.nature ? NATURES[intervention.nature] : 'À qualifier'}</dd>
              <dt>Confié à</dt>
              <dd>
                {intervention.affecteUtilisateur?.nomAffiche ??
                  (intervention.affecteArtisan
                    ? `${intervention.affecteArtisan.raisonSociale}${intervention.affecteArtisan.telephone ? ` (${intervention.affecteArtisan.telephone})` : ''}`
                    : 'Personne pour le moment')}
              </dd>
              <dt>Date prévue</dt>
              <dd>{dateCourte(intervention.datePrevue)}</dd>
            </dl>
          </section>

          {organiserChantier ? (
            <p>
              <Link
                className="bouton bouton-secondaire"
                href={`/benevoles/activites/nouvelle?intervention=${intervention.id}&organisation=${intervention.organisationId}`}
              >
                Organiser un chantier collectif
              </Link>
            </p>
          ) : null}

          {droits.transitions.length > 0 ? (
            <section className="carte" aria-labelledby="titre-avancement">
              <h2 id="titre-avancement">Faire avancer</h2>
              <div className="actions">
                {droits.transitions.map((vers) => (
                  <Formulaire key={vers} action={changerStatut} libelle={ACTIONS_STATUT[vers]}>
                    <input type="hidden" name="id" value={intervention.id} />
                    <input type="hidden" name="statut" value={vers} />
                    <BoutonEnvoi variante={vers === 'ANNULE' ? 'danger' : vers === 'CLOS' ? undefined : 'secondaire'}>
                      {vers === 'EN_COURS' && ['RESOLU', 'CLOS'].includes(intervention.statut)
                        ? 'Rouvrir : le problème revient'
                        : ACTIONS_STATUT[vers]}
                    </BoutonEnvoi>
                  </Formulaire>
                ))}
              </div>
            </section>
          ) : null}

          <section className="carte" aria-labelledby="titre-fil">
            <h2 id="titre-fil">Suivi</h2>
            <ol className="fil-evenements">
              {intervention.evenements.map((e) => (
                <li key={e.id}>
                  <span className="aide">{dateHeure(e.creeLe)}</span>
                  <br />
                  {phrase(e)}
                </li>
              ))}
            </ol>
            {droits.commenter ? (
              <Formulaire action={commenter} viderApresSucces libelle="Ajouter un commentaire">
                <input type="hidden" name="id" value={intervention.id} />
                <Champ nom="texte" libelle="Commentaire" type="textarea" obligatoire />
                <div className="actions">
                  <BoutonEnvoi variante="secondaire">Ajouter le commentaire</BoutonEnvoi>
                </div>
              </Formulaire>
            ) : null}
          </section>
        </div>

        <div>
          {droits.gerer && modifiable ? (
            <section className="carte" aria-labelledby="titre-qualifier">
              <h2 id="titre-qualifier">Qualifier</h2>
              <Formulaire action={qualifier}>
                <input type="hidden" name="id" value={intervention.id} />
                <Champ
                  nom="priorite"
                  libelle="Priorité"
                  obligatoire
                  options={options(PRIORITES)}
                  valeur={intervention.priorite ?? 'NORMALE'}
                />
                <Champ nom="nature" libelle="Nature" obligatoire options={options(NATURES)} valeur={intervention.nature ?? 'DEPANNAGE'} />
                <div className="actions">
                  <BoutonEnvoi variante="secondaire">Enregistrer</BoutonEnvoi>
                </div>
              </Formulaire>
            </section>
          ) : null}

          {affectables ? <SectionAffectation intervention={intervention} affectables={affectables} /> : null}

          <section className="carte" aria-labelledby="titre-couts">
            <h2 id="titre-couts">Coûts</h2>
            {intervention.couts.length === 0 ? (
              <p className="aide">Aucun devis ni facture.</p>
            ) : (
              <ul>
                {intervention.couts.map((c) => (
                  <li key={c.id}>
                    {c.type === 'DEVIS' ? 'Devis' : 'Facture'} · {c.libelle} : <strong>{euros(c.montantCentimes)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <p>
              Total facturé : <strong>{euros(intervention.totaux.facturesCentimes)}</strong>
              {intervention.totaux.devisCentimes > 0 ? (
                <span className="aide"> (devis : {euros(intervention.totaux.devisCentimes)})</span>
              ) : null}
            </p>
            {droits.gerer ? (
              <Formulaire action={ajouterCout} viderApresSucces libelle="Ajouter un devis ou une facture">
                <input type="hidden" name="id" value={intervention.id} />
                <Champ
                  nom="type"
                  libelle="Type"
                  obligatoire
                  options={[
                    { valeur: 'FACTURE', libelle: 'Facture' },
                    { valeur: 'DEVIS', libelle: 'Devis' },
                  ]}
                />
                <Champ nom="libelle" libelle="Libellé" obligatoire />
                <Champ nom="montant" libelle="Montant TTC (€)" obligatoire modeSaisie="decimal" aide="Ex. : 432,10" />
                <div className="actions">
                  <BoutonEnvoi variante="secondaire">Ajouter</BoutonEnvoi>
                </div>
              </Formulaire>
            ) : null}
          </section>

          <SectionDocuments
            entiteType="intervention"
            entiteId={intervention.id}
            page={`/travaux/${intervention.id}`}
            peutDeposer={droits.commenter}
            categorieParDefaut="photo"
          />
        </div>
      </div>
    </>
  );
}

function SectionAffectation({ intervention, affectables }: { intervention: InterventionDetail; affectables: Affectables }) {
  const exclues = affectables.personnes.filter((p) => !p.autorisee).length;
  const choix = [
    ...affectables.personnes.filter((p) => p.autorisee).map((p) => ({ valeur: `personne:${p.id}`, libelle: p.nomAffiche })),
    ...affectables.artisans.map((a) => ({
      valeur: `artisan:${a.id}`,
      libelle: `Artisan · ${a.raisonSociale}${a.specialiste ? ' (spécialiste)' : ''}`,
    })),
  ];
  const actuel = intervention.affecteUtilisateur
    ? `personne:${intervention.affecteUtilisateur.id}`
    : intervention.affecteArtisan
      ? `artisan:${intervention.affecteArtisan.id}`
      : undefined;

  return (
    <section className="carte" aria-labelledby="titre-affecter">
      <h2 id="titre-affecter">Confier l’intervention</h2>
      <Formulaire action={affecter}>
        <input type="hidden" name="id" value={intervention.id} />
        <Champ
          nom="cible"
          libelle="Personne ou artisan"
          options={choix}
          valeur={actuel}
          aide={
            exclues > 0
              ? 'Par sécurité, les bénévoles ne sont pas proposés pour le gaz et l’électricité.'
              : undefined
          }
        />
        <Champ nom="datePrevue" libelle="Date prévue" type="date" valeur={intervention.datePrevue?.slice(0, 10)} />
        <div className="actions">
          <BoutonEnvoi variante="secondaire">Enregistrer</BoutonEnvoi>
        </div>
      </Formulaire>
    </section>
  );
}

/** Phrase lisible pour chaque étape du fil. */
function phrase(e: EvenementIntervention): string {
  const qui = e.auteurNom ?? 'La plateforme';
  const d = e.details ?? {};
  switch (e.type) {
    case 'CREATION':
      return d.entretienId ? `${qui} a programmé cet entretien.` : `${qui} a signalé le problème.`;
    case 'ALERTE_URGENCE':
      return `Alerte urgente envoyée à ${String(d.destinataires ?? 0)} coordinateur(s) ou gestionnaire(s).`;
    case 'QUALIFICATION':
      return `${qui} a qualifié le signalement : priorité ${PRIORITES[String(d.priorite)]?.toLowerCase()}, ${NATURES[String(d.nature)]?.toLowerCase()}.`;
    case 'AFFECTATION':
      return d.utilisateurId || d.artisanId
        ? `${qui} a confié l’intervention${d.datePrevue ? `, prévue le ${dateCourte(String(d.datePrevue))}` : ''}.`
        : `${qui} a retiré l’affectation.`;
    case 'CHANGEMENT_STATUT':
      return `${qui} : ${STATUTS[String(d.de)]?.libelle.toLowerCase()} → ${STATUTS[String(d.vers)]?.libelle.toLowerCase()}.${
        d.commentaire ? ` « ${String(d.commentaire)} »` : ''
      }`;
    case 'COMMENTAIRE':
      return `${qui} : « ${String(d.texte ?? '')} »`;
    case 'COUT':
      return `${qui} a saisi ${d.type === 'DEVIS' ? 'un devis' : 'une facture'} de ${euros(Number(d.montantCentimes ?? 0))}.`;
    case 'NOTIFICATION_ECHEC':
      return `Une notification n’a pas pu être envoyée (${String(d.sujet ?? '')}).`;
    default:
      return `${qui} : ${e.type.toLowerCase()}.`;
  }
}
