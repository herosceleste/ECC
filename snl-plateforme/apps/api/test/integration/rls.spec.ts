import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  clientProprietaire,
  creerArbre,
  decrireAvecBase,
  URL_APPLICATION,
  viderBase,
  type Arbre,
} from './outils';

/**
 * Ces tests vérifient l'isolation au niveau de PostgreSQL lui-même, sans
 * passer par le code de l'API : même une requête mal écrite ne peut pas
 * traverser la frontière entre deux associations.
 */
decrireAvecBase('Isolation des associations par RLS', () => {
  const proprietaire = clientProprietaire();
  const application = new PrismaClient({ datasources: { db: { url: URL_APPLICATION } } });
  let a: Arbre;
  let b: Arbre;

  beforeAll(async () => {
    await viderBase(proprietaire);
    a = await creerArbre(proprietaire, 'rls-a');
    b = await creerArbre(proprietaire, 'rls-b');
    for (const arbre of [a, b]) {
      await proprietaire.logement.create({
        data: { tenantId: arbre.association, organisationId: arbre.groupe1, reference: 'L-001', typologie: 'T2' },
      });
    }
  });

  afterAll(async () => {
    await proprietaire.$disconnect();
    await application.$disconnect();
  });

  const dans = <T>(tenantId: string, f: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>) =>
    application.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return f(tx);
    });

  it('ne montre que les lignes de l’association courante', async () => {
    const logements = await dans(a.association, (tx) => tx.logement.findMany());
    expect(logements).toHaveLength(1);
    expect(logements[0]?.tenantId).toBe(a.association);
  });

  it('ne montre rien sans association définie', async () => {
    await expect(application.logement.findMany()).resolves.toEqual([]);
    await expect(application.organisation.findMany()).resolves.toEqual([]);
  });

  it('refuse d’écrire une ligne pour une autre association', async () => {
    await expect(
      dans(a.association, (tx) =>
        tx.logement.create({
          data: { tenantId: b.association, organisationId: b.groupe1, reference: 'INTRUS', typologie: 'T1' },
        }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('ne permet pas de modifier les lignes d’une autre association', async () => {
    const resultat = await dans(a.association, (tx) =>
      tx.logement.updateMany({ where: { tenantId: b.association }, data: { reference: 'PIRATE' } }),
    );
    expect(resultat.count).toBe(0);
  });

  it('interdit à l’application de modifier ou d’effacer le journal d’audit', async () => {
    await dans(a.association, (tx) =>
      tx.evenementAudit.create({
        data: { tenantId: a.association, action: 'test', entiteType: 'test', resultat: 'SUCCES' },
      }),
    );
    await expect(
      dans(a.association, (tx) => tx.evenementAudit.updateMany({ data: { action: 'falsifie' } })),
    ).rejects.toThrow(/permission denied/);
    await expect(dans(a.association, (tx) => tx.evenementAudit.deleteMany())).rejects.toThrow(/permission denied/);
  });

  it('liste les espaces d’un utilisateur dans toutes ses associations', async () => {
    const u = await proprietaire.utilisateur.create({
      data: { email: `${randomUUID()}@exemple.org`, nomAffiche: 'Multi', statut: 'ACTIF' },
    });
    await proprietaire.adhesion.createMany({
      data: [
        { tenantId: a.association, utilisateurId: u.id, organisationId: a.groupe1, role: 'BENEVOLE' },
        { tenantId: b.association, utilisateurId: u.id, organisationId: b.antenne, role: 'COORDINATEUR' },
      ],
    });
    const espaces = await application.$queryRaw<{ tenant_id: string }[]>`
      SELECT * FROM app_espaces_utilisateur(${u.id}::uuid)`;
    expect(espaces.map((e) => e.tenant_id).sort()).toEqual([a.association, b.association].sort());
  });
});
