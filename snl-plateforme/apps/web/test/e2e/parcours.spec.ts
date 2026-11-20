import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours réels dans un navigateur. Les comptes viennent de preparation.ts :
 * admin (association), coordo (groupe d'Évry), ts (antenne), benevole (Massy).
 */
test.describe.configure({ mode: 'serial' });

const CAPTURES = process.env.DOSSIER_CAPTURES;

async function capture(page: Page, nom: string) {
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/${nom}.png`, fullPage: true });
}

async function connecter(page: Page, compte: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/connexion/);
  await page.getByRole('link', { name: 'Se connecter' }).click();
  await page.getByRole('link', { name: new RegExp(`^${compte} \\(`) }).click();
  await expect(page).toHaveURL(/\/espaces/);
  await page.getByRole('button', { name: 'Entrer dans cet espace' }).click();
  await expect(page).toHaveURL(/\/accueil/);
}

/** Aucune violation grave ou critique des règles d'accessibilité (axe-core, WCAG A et AA). */
async function verifierAccessibilite(page: Page) {
  const resultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const graves = resultat.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(graves.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test('une page protégée renvoie vers la connexion', async ({ page }) => {
  await page.goto('/logements');
  await expect(page).toHaveURL(/\/connexion\?retour=%2Flogements/);
  await expect(page.getByRole('heading', { name: 'Plateforme SNL' })).toBeVisible();
  await verifierAccessibilite(page);
  await capture(page, '01-connexion');
});

test('un bénévole ne voit que son groupe (critère M0-1)', async ({ page }) => {
  await connecter(page, 'benevole');
  await expect(page.getByRole('heading', { name: 'Bonjour Alex Bénévole' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Journal' })).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Logements' }).click();
  await expect(page.getByRole('link', { name: 'MAS-001' })).toBeVisible();
  await expect(page.getByText('EVR-001')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ajouter un logement' })).toHaveCount(0);

  await page.getByRole('searchbox', { name: 'Rechercher un logement ou une personne' }).fill('EVR');
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page.getByText('Aucun résultat dans votre périmètre.')).toBeVisible();
});

test('un coordinateur sans second facteur est arrêté avec une explication', async ({ page }) => {
  await connecter(page, 'coordo-sans-mfa').catch(() => undefined);
  await page.goto('/accueil');
  await expect(page.getByRole('heading', { name: 'Connexion renforcée nécessaire' })).toBeVisible();
});

test('un coordinateur crée et modifie un logement', async ({ page }) => {
  await connecter(page, 'coordo');
  await page.goto('/logements/nouveau');
  await page.getByLabel('Référence').fill('EVR-002');
  await page.getByLabel('Surface (m²)').fill('-3');
  await page.getByRole('button', { name: 'Enregistrer le logement' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ne sont pas valides' })).toBeVisible();
  await expect(page.getByLabel('Surface (m²)')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Référence')).toHaveValue('EVR-002');

  await page.getByLabel('Surface (m²)').fill('38,5');
  await page.getByLabel('Typologie').selectOption('T2');
  await page.getByRole('button', { name: 'Enregistrer le logement' }).click();
  await expect(page.getByRole('heading', { name: 'Logement EVR-002' })).toBeVisible();
  await expect(page.getByText('Le logement a été enregistré.')).toBeVisible();
  await expect(page.getByText('38,5 m²')).toBeVisible();

  await page.getByLabel('Statut').selectOption('EN_TRAVAUX');
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await expect(page.getByText('Le logement a été mis à jour.')).toBeVisible();
  await expect(page.locator('.titre-page .badge')).toHaveText('En travaux');
  await verifierAccessibilite(page);
  await capture(page, '03-fiche-logement');
});

test('un travailleur social gère un ménage, les doublons et les données sensibles', async ({ page }) => {
  await connecter(page, 'ts');
  await page.goto('/menages/nouveau');
  await page.getByLabel('Groupe ou antenne').selectOption({ label: 'Groupe d’Évry' });
  await page.getByLabel('Nom du ménage').fill('Famille Martin');
  await page.getByRole('button', { name: 'Créer le ménage' }).click();
  await expect(page.getByRole('heading', { name: 'Famille Martin' })).toBeVisible();

  const ajouter = async (prenom: string, nom: string) => {
    await page.getByLabel('Prénom').fill(prenom);
    await page.getByRole('textbox', { name: 'Nom', exact: true }).fill(nom);
    await page.getByLabel('Date de naissance').fill('1987-03-14');
    await page.getByRole('button', { name: 'Ajouter la personne' }).click();
  };
  await ajouter('Léa', 'Martin');
  await expect(page.getByText('Léa Martin a été ajouté(e) au ménage.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Léa Martin' })).toBeVisible();

  await ajouter('LEA', 'MARTIN');
  await expect(page.getByText('Une personne très proche existe déjà')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Nom', exact: true })).toHaveValue('MARTIN');
  await verifierAccessibilite(page);
  await capture(page, '04-doublon');
  await page.getByLabel('Je confirme qu’il s’agit d’une autre personne').check();
  await page.getByRole('button', { name: 'Ajouter la personne' }).click();
  await expect(page.getByText('LEA MARTIN a été ajouté(e) au ménage.')).toBeVisible();

  await page.getByRole('link', { name: 'Léa Martin' }).click();
  await page.getByRole('link', { name: 'Afficher les informations' }).click();
  await page.getByLabel('Ressources mensuelles (€)').fill('845');
  await page.getByLabel('Nature des ressources').fill('RSA');
  await page.getByRole('button', { name: 'Enregistrer' }).nth(1).click();
  await expect(page.getByText('Les données sensibles ont été enregistrées (chiffrées).')).toBeVisible();
  await page.getByRole('link', { name: 'Masquer' }).click();
  await page.getByRole('link', { name: 'Afficher les informations' }).click();
  await expect(page.getByLabel('Nature des ressources')).toHaveValue('RSA');
  await capture(page, '05-fiche-personne');
});

test('un administrateur active un module, invite un bénévole et consulte le journal', async ({ page }) => {
  await connecter(page, 'admin');
  await verifierAccessibilite(page);
  await capture(page, '02-accueil-admin');

  await page.goto('/organisations');
  await page.getByRole('link', { name: 'Groupe de Massy' }).click();
  const ligneM1 = page.getByRole('row').filter({ hasText: 'M1 Travaux et entretien' });
  await ligneM1.getByRole('button', { name: 'Activer' }).click();
  await expect(ligneM1.getByText('Activé', { exact: true })).toBeVisible();

  await page.goto('/utilisateurs');
  await page.getByLabel('Prénom et nom').fill('Noé Nouveau');
  await page.getByLabel('Adresse électronique').fill('noe@exemple.org');
  await page.getByLabel('Organisation').selectOption({ label: 'Groupe de Massy' });
  await page.getByRole('button', { name: 'Envoyer l’invitation' }).click();
  await expect(page.getByText('L’invitation a été envoyée à noe@exemple.org.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'noe@exemple.org' }).getByText('Invité')).toBeVisible();
  await verifierAccessibilite(page);
  await capture(page, '06-equipe');

  await page.goto('/journal');
  await expect(page.getByRole('cell', { name: 'consulter-sensible' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'inviter' }).first()).toBeVisible();
  await capture(page, '07-journal');
});

test('la déconnexion ferme la session', async ({ page }) => {
  await connecter(page, 'benevole');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/connexion\?deconnecte=1/);
  await expect(page.getByText('Vous êtes déconnecté. À bientôt.')).toBeVisible();
  await page.goto('/accueil');
  await expect(page).toHaveURL(/\/connexion/);
});
