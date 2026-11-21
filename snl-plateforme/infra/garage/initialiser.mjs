/**
 * Initialisation idempotente de Garage par son API d'administration :
 * disposition du nœud, clé d'accès de l'API SNL, compartiment « documents ».
 * Exécuté une fois au démarrage par le service « garage-init ».
 */
const base = process.env.GARAGE_ADMIN_URL ?? 'http://garage:3903';
const jeton = process.env.GARAGE_ADMIN_TOKEN;
const cle = process.env.S3_ACCESS_KEY;
const secret = process.env.S3_SECRET_KEY;
const compartiment = process.env.S3_BUCKET ?? 'documents';

if (!jeton || !/^GK[0-9a-f]{24}$/.test(cle ?? '') || !/^[0-9a-f]{64}$/.test(secret ?? '')) {
  console.error('GARAGE_ADMIN_TOKEN, S3_ACCESS_KEY (GK + 24 hexadécimaux) et S3_SECRET_KEY (64 hexadécimaux) sont requis.');
  process.exit(1);
}

async function appel(methode, chemin, corps) {
  const reponse = await fetch(`${base}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await reponse.text();
  return { statut: reponse.status, donnees: texte ? JSON.parse(texte) : null };
}

async function attendreGarage() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const { statut } = await appel('GET', '/v1/status');
      if (statut === 200) return;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Garage ne répond pas.');
}

await attendreGarage();
const { donnees: etat } = await appel('GET', '/v1/status');
const noeud = etat.node;

const { donnees: disposition } = await appel('GET', '/v1/layout');
if (!disposition.roles.some((r) => r.id === noeud)) {
  await appel('POST', '/v1/layout', [{ id: noeud, zone: 'dc1', capacity: 10_000_000_000, tags: [] }]);
  const apply = await appel('POST', '/v1/layout/apply', { version: disposition.version + 1 });
  if (apply.statut !== 200) throw new Error(`Disposition refusée : ${JSON.stringify(apply.donnees)}`);
  console.log('Disposition du nœud appliquée.');
}

const existante = await appel('GET', `/v1/key?id=${cle}`);
if (existante.statut !== 200) {
  const r = await appel('POST', '/v1/key/import', { accessKeyId: cle, secretAccessKey: secret, name: 'snl-api' });
  if (r.statut !== 200) throw new Error(`Import de la clé refusé : ${JSON.stringify(r.donnees)}`);
  console.log('Clé d’accès importée.');
}

let bucket = await appel('GET', `/v1/bucket?globalAlias=${compartiment}`);
if (bucket.statut !== 200) {
  bucket = await appel('POST', '/v1/bucket', { globalAlias: compartiment });
  if (bucket.statut !== 200) throw new Error(`Création du compartiment refusée : ${JSON.stringify(bucket.donnees)}`);
  console.log(`Compartiment « ${compartiment} » créé.`);
}
const autorisation = await appel('POST', '/v1/bucket/allow', {
  bucketId: bucket.donnees.id,
  accessKeyId: cle,
  permissions: { read: true, write: true, owner: false },
});
if (autorisation.statut !== 200) throw new Error(`Droits refusés : ${JSON.stringify(autorisation.donnees)}`);
console.log('Stockage prêt.');
