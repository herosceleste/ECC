import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Parcours du module M2 Coordination des bénévoles (comptes de preparation.ts). */
test.describe.configure({ mode: 'serial' });

const CAPTURES = process.env.DOSSIER_CAPTURES;
const dansUneSemaine = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

async function connecter(page: Page, compte: string) {
  await page.goto('/connexion');
  await page.getByRole('link', { name: 'Se connecter' }).click();
  await page.getByRole('link', { name: new RegExp(`^${compte} \\(`) }).click();
  await page.getByRole('button', { name: 'Entrer dans cet espace' }).click();
  await expect(page).toHaveURL(/\/accueil/);
}

async function verifierAccessibilite(page: Page) {
  const resultat = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const graves = resultat.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(graves.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
}

test('un coordinateur propose un chantier d’une place', async ({ page }) => {
  await connecter(page, 'coordo');
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Bénévoles' }).click();
  await page.getByRole('link', { name: 'Proposer une activité' }).click();
  await verifierAccessibilite(page);

  await page.getByLabel('Type d’activité').selectOption('CHANTIER');
  await page.getByLabel('Titre').fill('Chantier peinture, salon EVR-001');
  await page.getByLabel('Lieu').fill('12 rue des Tilleuls, Évry-Courcouronnes');
  await page.getByLabel('Date').fill(dansUneSemaine);
  await page.getByLabel('Début').fill('09:30');
  await page.getByLabel('Fin').fill('12:00');
  await page.getByLabel('Nombre de places').fill('1');
  await page.getByRole('button', { name: 'Publier dans le planning' }).click();

  await expect(page.getByText('L’activité est publiée dans le planning du groupe.')).toBeVisible();
  await expect(page.getByText(/09:30 – 12:00/)).toBeVisible();
  await expect(page.getByText('0 sur 1')).toBeVisible();
});

test('liste d’attente, désistement et place récupérée (critères M2-1 et M2-2)', async ({ page, browser }) => {
  await connecter(page, 'ts');
  await page.goto('/benevoles');
  const carte = page.getByRole('article', { name: 'Chantier peinture, salon EVR-001' });
  await carte.getByRole('button', { name: 'Je m’inscris' }).click();
  await expect(page.getByText('C’est noté. Vous recevrez un rappel la veille.')).toBeVisible();
  await expect(carte.getByText('Inscrit', { exact: true })).toBeVisible();

  // Seconde personne : son propre contexte de navigateur (cookies séparés).
  const contexteCoordo = await browser.newContext({ baseURL: 'http://localhost:3100', locale: 'fr-FR' });
  const coordo = await contexteCoordo.newPage();
  await connecter(coordo, 'coordo');
  await coordo.goto('/benevoles');
  const carteCoordo = coordo.getByRole('article', { name: 'Chantier peinture, salon EVR-001' });
  await carteCoordo.getByRole('button', { name: 'Rejoindre la liste d’attente' }).click();
  await expect(carteCoordo.getByText('En liste d’attente')).toBeVisible();

  await carte.getByRole('button', { name: 'Me désister' }).click();
  await expect(page.getByText('Votre désistement est enregistré ; la coordination est prévenue.')).toBeVisible();

  await coordo.reload();
  await expect(carteCoordo.getByText('Inscrit', { exact: true })).toBeVisible();
  await carteCoordo.getByRole('link', { name: 'Chantier peinture, salon EVR-001' }).click();
  await expect(coordo.getByRole('region', { name: 'Participants' }).getByText('Dominique Coordo')).toBeVisible();
  await verifierAccessibilite(coordo);
  if (CAPTURES) await coordo.screenshot({ path: `${CAPTURES}/12-activite.png`, fullPage: true });
  await contexteCoordo.close();
});

test('un bénévole d’un autre groupe ne voit pas l’activité, gère son profil et son agenda', async ({ page }) => {
  await connecter(page, 'benevole');
  await page.goto('/benevoles');
  await expect(page.getByText('Chantier peinture, salon EVR-001')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Proposer une activité' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Mon profil et mes disponibilités' }).click();
  await page.getByRole('textbox', { name: /^Téléphone/ }).fill('06 12 34 56 78');
  await page.getByLabel('Ne montrer mon téléphone qu’aux coordinateurs').check();
  await page.getByLabel('Compétences').fill('bricolage, peinture');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Votre profil est enregistré.')).toBeVisible();

  await page.getByLabel('Jour (chaque semaine)').selectOption('3');
  await page.locator('input[name=heureDebut]').fill('14:00');
  await page.locator('input[name=heureFin]').fill('17:00');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByText('le mercredi, 14 h 00 – 17 h 00')).toBeVisible();
  await verifierAccessibilite(page);
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/13-profil-benevole.png`, fullPage: true });

  const agenda = await page.request.get('/benevoles/agenda.ics');
  expect(agenda.status()).toBe(200);
  expect(agenda.headers()['content-type']).toContain('text/calendar');
  expect(await agenda.text()).toContain('BEGIN:VCALENDAR');
});
