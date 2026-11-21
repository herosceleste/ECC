import { expect, test, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { crc32 } from 'node:zlib';

/**
 * Recette d'une installation complète (docker compose), avec le vrai Keycloak,
 * les vrais courriels (Mailpit), le stockage Garage et l'antivirus ClamAV.
 *
 * Préalable, sur une installation neuve :
 *   1. creer-association --slug snl-pilote --admin-email camille.pilote@exemple.org …
 *   2. donnees-demo --slug snl-pilote
 * Puis : URL_WEB=http://localhost:3000 URL_MAILPIT=http://localhost:8025 npm run test:recette
 *
 * Elle crée des comptes de test : à ne lancer que sur une installation de recette.
 */
test.describe.configure({ mode: 'serial' });

const MAILPIT = process.env.URL_MAILPIT ?? 'http://localhost:8025';
const ADMIN = process.env.EMAIL_ADMIN ?? 'camille.pilote@exemple.org';
const COORDINATEUR = 'dominique.pilote@exemple.org';
const MOT_DE_PASSE = 'Recette-Pilote-2026!';
const CAPTURES = process.env.DOSSIER_CAPTURES;
const secretsTotp = new Map<string, string>();
/** Dernier code accepté par compte : Keycloak refuse qu'un code serve deux fois. */
const derniersCodes = new Map<string, string>();

// --- Outils ---------------------------------------------------------------------

/**
 * Code TOTP (RFC 6238, SHA-1, 6 chiffres, 30 s), comme une application
 * d'authentification. Keycloak transmet la clé brute dans le champ caché
 * « totpSecret » (l'écran en affiche la version base32).
 */
function codeTotp(secretBrut: string, instant = Date.now()): string {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(Math.floor(instant / 30_000)));
  const hmac = createHmac('sha1', Buffer.from(secretBrut, 'utf8')).update(compteur).digest();
  const decalage = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const nombre = hmac.readUInt32BE(decalage) & 0x7fffffff;
  return String(nombre % 1_000_000).padStart(6, '0');
}

/** Keycloak refuse de réutiliser un code : on attend la période suivante si besoin. */
async function codeFrais(secret: string, dernier?: string): Promise<string> {
  let code = codeTotp(secret);
  while (code === dernier) {
    await new Promise((r) => setTimeout(r, 2_000));
    code = codeTotp(secret);
  }
  return code;
}

async function dernierCourriel(destinataire: string, sujet?: RegExp, delaiMs = 20_000) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    const liste = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as {
      messages: { ID: string; Subject: string; To: { Address: string }[] }[];
    };
    const trouve = liste.messages.find(
      (m) => m.To.some((t) => t.Address === destinataire) && (!sujet || sujet.test(m.Subject)),
    );
    if (trouve) {
      return (await (await fetch(`${MAILPIT}/api/v1/message/${trouve.ID}`)).json()) as { Subject: string; Text: string };
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`Aucun courriel pour ${destinataire}${sujet ? ` (${sujet})` : ''}.`);
}

/** Active un compte invité : lien du courriel, second facteur, mot de passe. */
async function activerCompte(page: Page, email: string) {
  const courriel = await dernierCourriel(email, /compte/i);
  const lien = courriel.Text.match(/https?:\/\/\S+action-token\S+/)?.[0];
  expect(lien, 'lien d’activation dans le courriel').toBeTruthy();
  await page.goto(lien as string);
  await page.getByRole('link', { name: /Cliquez ici/ }).click();

  const secret = await page.locator('#totpSecret').inputValue();
  secretsTotp.set(email, secret);
  const code = codeTotp(secret);
  derniersCodes.set(email, code);
  await page.locator('#totp').fill(code);
  await page.locator('#userLabel').fill('Téléphone de recette');
  await page.locator('#saveTOTPBtn').click();

  await page.locator('#password-new').fill(MOT_DE_PASSE);
  await page.locator('#password-confirm').fill(MOT_DE_PASSE);
  await page.locator('input[type=submit], button[type=submit]').first().click();
  // Compte créé avant que l'API ne transmette prénom et nom : Keycloak les redemande.
  if (await page.locator('#lastName').isVisible().catch(() => false)) {
    await page.locator('#lastName').fill('Recette');
    await page.locator('input[type=submit], button[type=submit]').first().click();
  }
  await expect(page.locator('body')).toContainText(/mis à jour|retour à l’application|Back to Application/i);
}

async function seConnecter(page: Page, email: string) {
  await page.goto('/connexion');
  await page.getByRole('link', { name: 'Se connecter' }).click();
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(MOT_DE_PASSE);
  await page.locator('#kc-login').click();
  const secret = secretsTotp.get(email) as string;
  // Un code déjà utilisé (activation, connexion précédente) ne peut pas resservir.
  const code = await codeFrais(secret, derniersCodes.get(email));
  derniersCodes.set(email, code);
  await page.locator('#otp').fill(code);
  await page.locator('#kc-login').click();
  await expect(page).toHaveURL(/\/espaces/);
  await page.getByRole('button', { name: 'Entrer dans cet espace' }).click();
  await expect(page).toHaveURL(/\/accueil/);
}

/**
 * Archive ZIP minimale (sans compression) contenant un seul fichier. Sert à
 * glisser le fichier de test EICAR dans un document au format ZIP (.docx) :
 * l'antivirus ouvre les archives et doit l'y trouver.
 */
function archiveZip(nom: string, contenu: Buffer): Buffer {
  const nomOctets = Buffer.from(nom);
  const crc = crc32(contenu);
  const entete = Buffer.alloc(30);
  entete.writeUInt32LE(0x04034b50, 0);
  entete.writeUInt16LE(20, 4);
  entete.writeUInt32LE(crc, 14);
  entete.writeUInt32LE(contenu.length, 18);
  entete.writeUInt32LE(contenu.length, 22);
  entete.writeUInt16LE(nomOctets.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(contenu.length, 20);
  central.writeUInt32LE(contenu.length, 24);
  central.writeUInt16LE(nomOctets.length, 28);
  const local = Buffer.concat([entete, nomOctets, contenu]);
  const repertoire = Buffer.concat([central, nomOctets]);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(1, 8);
  fin.writeUInt16LE(1, 10);
  fin.writeUInt32LE(repertoire.length, 12);
  fin.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, repertoire, fin]);
}

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

// --- Parcours ---------------------------------------------------------------------

test('l’administrateur active son compte depuis le courriel d’invitation', async ({ page }) => {
  await activerCompte(page, ADMIN);
});

test('l’administrateur se connecte avec son second facteur et invite un coordinateur', async ({ page }) => {
  await seConnecter(page, ADMIN);
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/recette-accueil.png`, fullPage: true });

  await page.goto('/utilisateurs');
  await page.getByLabel('Prénom et nom').fill('Dominique Pilote');
  await page.getByLabel('Adresse électronique').fill(COORDINATEUR);
  await page.getByLabel('Organisation').selectOption({ label: 'Groupe Nord (démo)' });
  await page.getByLabel('Rôle').selectOption('COORDINATEUR');
  await page.getByRole('button', { name: 'Envoyer l’invitation' }).click();
  await expect(page.getByText(`L’invitation a été envoyée à ${COORDINATEUR}.`)).toBeVisible();
  await dernierCourriel(COORDINATEUR, /compte/i);
});

test('le coordinateur signale une urgence avec photo, reçoit l’alerte et récupère la photo', async ({ page }) => {
  await activerCompte(page, COORDINATEUR);
  await seConnecter(page, COORDINATEUR);

  await page.goto('/travaux/signaler');
  await page.getByRole('combobox', { name: 'Logement' }).selectOption({ label: 'DEMO-N1, 1 rue de l’Exemple, Villefictive' });
  await page.getByLabel('Type de problème').selectOption('GAZ');
  await page.getByLabel('Description').fill('Odeur de gaz dans la cuisine, signalée lors de la visite.');
  const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('photo de recette')]);
  await page.getByLabel('Photos').setInputFiles({ name: 'cuisine.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Signalement urgent' })).toBeVisible();
  await expect(page.getByText(/n’a pas pu être enregistrée/)).toHaveCount(0);
  const alerte = await dernierCourriel(COORDINATEUR, /URGENT/);
  expect(alerte.Text).toContain('DEMO-N1');
  expect(alerte.Text).not.toContain('cuisine');

  const lien = page.getByRole('link', { name: 'cuisine.jpg' });
  await expect(lien).toBeVisible();
  const reponse = await page.request.get(await lien.getAttribute('href') as string);
  expect(reponse.status()).toBe(200);
  expect(Buffer.from(await reponse.body()).equals(photo)).toBe(true);
  if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/recette-urgence.png`, fullPage: true });

  // Un document contenant le fichier de test EICAR doit être refusé par l'antivirus.
  expect(EICAR).toHaveLength(68);
  await page.getByLabel('Fichier').setInputFiles({
    name: 'releve.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: archiveZip('eicar.com', Buffer.from(EICAR)),
  });
  await page.getByRole('button', { name: 'Déposer' }).click();
  await expect(page.getByText(/élément dangereux/)).toBeVisible();
});

test('la déconnexion ferme aussi la session Keycloak', async ({ page }) => {
  await seConnecter(page, COORDINATEUR);
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  const confirmer = page.locator('#kc-logout');
  if (await confirmer.isVisible().catch(() => false)) await confirmer.click();
  await expect(page).toHaveURL(/\/connexion\?deconnecte=1/);
  await page.getByRole('link', { name: 'Se connecter' }).click();
  await expect(page.locator('#username')).toBeVisible();
});
