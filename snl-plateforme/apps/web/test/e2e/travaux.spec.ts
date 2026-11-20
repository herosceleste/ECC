import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Parcours du module M1 Travaux et entretien (comptes de preparation.ts). */
test.describe.configure({ mode: 'serial' });

const CAPTURES = process.env.DOSSIER_CAPTURES;

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

test('un bénévole signale un problème, même si la photo ne peut pas être enregistrée', async ({ page }) => {
  await connecter(page, 'benevole');
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Travaux' }).click();
  await page.getByRole('link', { name: 'Signaler un problème' }).click();
  await verifierAccessibilite(page);

  await page.getByRole('combobox', { name: 'Logement' }).selectOption({ label: 'MAS-001' });
  await page.getByLabel('Type de problème').selectOption('PLOMBERIE');
  await page.getByLabel('Description').fill('Fuite');
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click();
  await expect(page.getByText('10 caractères au moins')).toBeVisible();

  await page.getByLabel('Description').fill('La chasse d’eau coule sans arrêt depuis hier soir.');
  await page.getByLabel('Photos').setInputFiles({
    name: 'fuite.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]),
  });
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click();

  await expect(page.getByRole('heading', { name: 'Plomberie, fuite d’eau' })).toBeVisible();
  await expect(page.getByText('Le signalement est enregistré.')).toBeVisible();
  // L'antivirus n'est pas joignable dans cet environnement : la photo est refusée, le signalement reste.
  await expect(page.getByText('Une photo n’a pas pu être enregistrée(s).')).toBeVisible();
  await expect(page.getByText('Alex Bénévole a signalé le problème.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qualifier' })).toHaveCount(0);
});

test('un coordinateur traite une urgence de bout en bout et en suit le coût', async ({ page }) => {
  await connecter(page, 'coordo');
  await page.goto('/travaux/signaler');
  await page.getByRole('combobox', { name: 'Logement' }).selectOption({ label: 'EVR-001, 12 rue des Tilleuls, Évry-Courcouronnes' });
  await page.getByLabel('Type de problème').selectOption('GAZ');
  await page.getByLabel('Description').fill('Odeur de gaz signalée près de la chaudière.');
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click();

  const alerte = page.getByRole('alert').filter({ hasText: 'Signalement urgent' });
  await expect(alerte).toBeVisible();
  await expect(alerte.getByRole('link', { name: '0 800 47 33 33' })).toHaveAttribute('href', 'tel:0800473333');
  await expect(page.getByText(/Alerte urgente envoyée à 1 coordinateur/)).toBeVisible();
  await verifierAccessibilite(page);
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/09-urgence.png`, fullPage: true });

  await page.getByLabel('Nature').selectOption('DEPANNAGE');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await expect(page.getByText('La qualification est enregistrée.')).toBeVisible();

  await page.getByLabel('Personne ou artisan').selectOption({ label: 'Dominique Coordo' });
  await page.getByLabel('Date prévue').fill('2026-12-02');
  await page.getByRole('button', { name: 'Enregistrer' }).nth(1).click();
  await expect(page.getByText('L’intervention est confiée.')).toBeVisible();
  await expect(page.locator('.titre-page .badge').last()).toHaveText('Planifié');

  for (const [action, etape] of [['Démarrer', 'en cours'], ['Marquer comme résolu', 'résolu'], ['Clore', 'clos']]) {
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByText(`Le statut est mis à jour : ${etape}.`)).toBeVisible();
  }
  await expect(page.locator('.titre-page .badge').last()).toHaveText('Clos');

  await page.getByLabel('Libellé').fill('Intervention du chauffagiste');
  await page.getByLabel('Montant TTC (€)').fill('432,10');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByText('Montant enregistré.')).toBeVisible();
  await expect(page.getByText('Total facturé : 432,10 €')).toBeVisible();
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/10-intervention-close.png`, fullPage: true });

  await page.getByRole('link', { name: 'EVR-001' }).click();
  const travaux = page.getByRole('region', { name: 'Travaux et entretien' });
  await expect(travaux.getByRole('link', { name: 'Gaz' })).toBeVisible();
  await expect(travaux.getByText('Coût total facturé : 432,10 €')).toBeVisible();
});

test('chacun ne voit que les signalements de son groupe', async ({ page }) => {
  await connecter(page, 'benevole');
  await page.goto('/travaux?statut=CLOS');
  await expect(page.getByText('Aucun signalement à afficher.')).toBeVisible();
  await page.goto('/travaux');
  await expect(page.getByRole('link', { name: 'Plomberie, fuite d’eau' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gaz' })).toHaveCount(0);
  await verifierAccessibilite(page);
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/11-liste-travaux.png`, fullPage: true });
});
