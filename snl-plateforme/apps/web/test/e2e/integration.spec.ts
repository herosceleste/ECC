import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours du module M3 Accueil des bénévoles, dans le groupe de Juvisy
 * (seul groupe où M3 est activé, voir preparation.ts).
 */
test.describe.configure({ mode: 'serial' });

const CAPTURES = process.env.DOSSIER_CAPTURES;

async function connecter(page: Page, compte: string, arrivee: RegExp) {
  await page.goto('/connexion');
  await page.getByRole('link', { name: 'Se connecter' }).click();
  await page.getByRole('link', { name: new RegExp(`^${compte} \\(`) }).click();
  await page.getByRole('button', { name: 'Entrer dans cet espace' }).click();
  await expect(page).toHaveURL(arrivee);
}

async function verifierAccessibilite(page: Page) {
  const resultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const graves = resultat.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(graves.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test('l’administrateur prépare le parcours national et désigne une marraine', async ({ page }) => {
  await connecter(page, 'admin', /\/accueil/);
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Intégration' }).click();
  await page.getByRole('link', { name: 'Contenus' }).click();
  await verifierAccessibilite(page);

  const ajouter = async (type: string, titre: string, corps: string, ordre: string) => {
    await page.getByRole('combobox', { name: /^Pour/ }).selectOption({ label: 'SNL Essonne (démo) (toute l’association)' });
    await page.getByRole('combobox', { name: /^Type/ }).selectOption(type);
    await page.getByLabel('Titre').fill(titre);
    await page.getByLabel('Texte').fill(corps);
    await page.getByLabel('Ordre d’affichage').fill(ordre);
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    // On attend le contenu dans la liste : le message de l'ajout précédent peut encore être affiché.
    await expect(page.locator('section[aria-labelledby="titre-liste"]').getByText(titre, { exact: true })).toBeVisible();
  };
  await ajouter('ETAPE', 'Découvrir SNL', 'L’histoire de l’association et ses valeurs.', '1');
  await ajouter('ETAPE', 'Visiter un logement', 'Accompagnez un bénévole expérimenté lors d’une visite.', '2');
  await ajouter('FAQ', 'Comment signaler une fuite d’eau ?', 'Menu Travaux, puis « Signaler un problème ».', '0');
  await ajouter('CONTACT', 'Secrétariat de l’antenne', 'Du lundi au vendredi, 9 h – 17 h.\n01 00 00 00 00', '0');

  await page.getByRole('link', { name: 'Nouveaux bénévoles' }).click();
  const fiche = page.getByRole('region', { name: 'Nina Nouvelle' });
  await expect(fiche.getByText('Parcours : 0/2')).toBeVisible();
  await fiche.getByLabel('Parrain ou marraine').selectOption({ label: 'Maud Marraine' });
  await fiche.getByRole('button', { name: 'Désigner' }).click();
  await expect(page.getByText('Parrain ou marraine désigné, et prévenu par courriel.')).toBeVisible();
  await expect(fiche.getByText(/Accompagné\(e\) par/)).toContainText('Maud Marraine');
});

test('critères M3-1 et M3-2 : la nouvelle bénévole arrive sur son parcours et signe avant d’accéder aux ménages', async ({ page }) => {
  await connecter(page, 'nouvelle', /\/integration$/);
  await expect(page.getByRole('heading', { name: 'Bienvenue dans l’équipe' })).toBeVisible();
  await expect(page.getByText(/À faire en premier : lire et signer/)).toBeVisible();
  await expect(page.getByText('Maud Marraine')).toBeVisible();
  await verifierAccessibilite(page);
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/14-integration.png`, fullPage: true });

  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Ménages' }).click();
  await expect(page.getByRole('alert').getByRole('heading', { name: 'Engagement de confidentialité' })).toBeVisible();
  await page.getByRole('link', { name: 'Lire et signer l’engagement' }).click();

  const engagement = page.getByRole('region', { name: 'Engagement de confidentialité' });
  await engagement.getByRole('button', { name: 'Signer' }).click();
  await expect(engagement.getByText('Cochez la case pour confirmer')).toBeVisible();
  await engagement.getByLabel('J’ai lu ce texte et je m’engage à le respecter').check();
  await engagement.getByRole('button', { name: 'Signer' }).click();
  await expect(page).toHaveURL(/\/menages$/);
  await expect(page.getByRole('link', { name: 'Famille Juvisy (démo)' })).toBeVisible();

  await page.goto('/integration');
  await page.getByRole('button', { name: 'J’ai terminé cette étape' }).first().click();
  await expect(page.getByText('1 étape sur 2')).toBeVisible();

  await page.getByRole('link', { name: 'Fiches, questions et contacts' }).click();
  await page.getByRole('searchbox', { name: 'Chercher une question' }).fill('fuites');
  await page.getByRole('button', { name: 'Chercher', exact: true }).click();
  await expect(page.getByText('1 réponse(s) pour « fuites ».')).toBeVisible();
  await expect(page.getByText('Secrétariat de l’antenne')).toBeVisible();
  await verifierAccessibilite(page);
});
