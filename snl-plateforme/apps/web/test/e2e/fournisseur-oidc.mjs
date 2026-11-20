/**
 * Faux fournisseur d'identité OIDC, pour les tests de bout en bout uniquement.
 *
 * Il reproduit les adresses de Keycloak (royaume « snl ») et signe de vrais
 * jetons RS256 : l'API les vérifie exactement comme en production (clés
 * publiques, émetteur, audience). À la place du formulaire de connexion, une
 * page propose les comptes de test.
 *
 * NE JAMAIS DÉPLOYER : ce serveur authentifie n'importe qui.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const PORT = Number(process.env.PORT_OIDC ?? 8099);
const EMETTEUR = `http://127.0.0.1:${PORT}/realms/snl`;
const BASE = '/realms/snl/protocol/openid-connect';

/** Comptes proposés ; « acr: mfa » simule une connexion avec second facteur. */
const COMPTES = {
  admin: { nom: 'Camille Admin', acr: 'mfa' },
  coordo: { nom: 'Dominique Coordo', acr: 'mfa' },
  'coordo-sans-mfa': { sujet: 'coordo', nom: 'Dominique Coordo', acr: undefined },
  ts: { nom: 'Sacha Travailleur', acr: 'mfa' },
  benevole: { nom: 'Alex Bénévole', acr: undefined },
};

const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'cle-test', alg: 'RS256', use: 'sig' };
const codes = new Map();
const rafraichissements = new Map();

async function jetons(compteId) {
  const compte = COMPTES[compteId];
  const sujet = compte.sujet ?? compteId;
  const jetonAcces = await new SignJWT({
    email: `${sujet}@exemple.org`,
    name: compte.nom,
    ...(compte.acr ? { acr: compte.acr } : {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'cle-test' })
    .setIssuer(EMETTEUR)
    .setAudience('snl-api')
    .setSubject(sujet)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  const rafraichissement = randomBytes(24).toString('base64url');
  rafraichissements.set(rafraichissement, compteId);
  return { access_token: jetonAcces, refresh_token: rafraichissement, expires_in: 300, token_type: 'Bearer' };
}

function lireCorps(requete) {
  return new Promise((resoudre) => {
    let corps = '';
    requete.on('data', (d) => (corps += d));
    requete.on('end', () => resoudre(new URLSearchParams(corps)));
  });
}

function json(reponse, statut, donnees) {
  reponse.writeHead(statut, { 'Content-Type': 'application/json' });
  reponse.end(JSON.stringify(donnees));
}

const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

createServer(async (requete, reponse) => {
  const url = new URL(requete.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname === `${BASE}/certs`) return json(reponse, 200, { keys: [jwk] });

  if (url.pathname === `${BASE}/auth`) {
    const p = url.searchParams;
    const boutons = Object.entries(COMPTES)
      .map(([id, c]) => {
        const lien = new URLSearchParams({
          compte: id,
          redirect_uri: p.get('redirect_uri') ?? '',
          state: p.get('state') ?? '',
          code_challenge: p.get('code_challenge') ?? '',
        });
        return `<li><a href="${BASE}/valider?${echapper(lien)}">${echapper(id)} (${echapper(c.nom)})</a></li>`;
      })
      .join('');
    reponse.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return reponse.end(
      `<!doctype html><html lang="fr"><title>Connexion de test</title><h1>Fournisseur d’identité de test</h1><ul>${boutons}</ul></html>`,
    );
  }

  if (url.pathname === `${BASE}/valider`) {
    const p = url.searchParams;
    const code = randomBytes(16).toString('base64url');
    codes.set(code, { compte: p.get('compte'), defi: p.get('code_challenge'), redirection: p.get('redirect_uri') });
    const retour = new URL(p.get('redirect_uri') ?? '');
    retour.searchParams.set('code', code);
    retour.searchParams.set('state', p.get('state') ?? '');
    reponse.writeHead(302, { Location: retour.toString() });
    return reponse.end();
  }

  if (url.pathname === `${BASE}/token` && requete.method === 'POST') {
    const corps = await lireCorps(requete);
    if (corps.get('grant_type') === 'authorization_code') {
      const demande = codes.get(corps.get('code') ?? '');
      codes.delete(corps.get('code') ?? '');
      const defi = createHash('sha256').update(corps.get('code_verifier') ?? '').digest('base64url');
      if (!demande || demande.defi !== defi || demande.redirection !== corps.get('redirect_uri')) {
        return json(reponse, 400, { error: 'invalid_grant' });
      }
      return json(reponse, 200, await jetons(demande.compte));
    }
    if (corps.get('grant_type') === 'refresh_token') {
      const compte = rafraichissements.get(corps.get('refresh_token') ?? '');
      if (!compte) return json(reponse, 400, { error: 'invalid_grant' });
      return json(reponse, 200, await jetons(compte));
    }
    return json(reponse, 400, { error: 'unsupported_grant_type' });
  }

  if (url.pathname === `${BASE}/revoke`) {
    const corps = await lireCorps(requete);
    rafraichissements.delete(corps.get('token') ?? '');
    reponse.writeHead(200);
    return reponse.end();
  }

  if (url.pathname === `${BASE}/logout`) {
    reponse.writeHead(302, { Location: url.searchParams.get('post_logout_redirect_uri') ?? '/' });
    return reponse.end();
  }

  reponse.writeHead(404);
  reponse.end();
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`Fournisseur OIDC de test sur ${EMETTEUR}\n`);
});
