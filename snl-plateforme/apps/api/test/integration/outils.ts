import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type RoleMembre } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { configurerApplication } from '../../src/application';
import { FournisseurIdentite, type Invitation } from '../../src/auth/fournisseur-identite';
import { VerificateurJeton, type JetonVerifie } from '../../src/auth/verificateur-jeton';
import { chargerConfiguration } from '../../src/config/configuration';
import { Antivirus } from '../../src/documents/antivirus';
import { Stockage } from '../../src/documents/stockage';
import { Notificateur, type Message } from '../../src/notifications/notificateur';

export const URL_PROPRIETAIRE = process.env.DATABASE_URL_PROPRIETAIRE;
export const URL_APPLICATION = process.env.DATABASE_URL;

/** Les tests d'intégration sont ignorés si aucune base n'est fournie. */
export const decrireAvecBase = URL_PROPRIETAIRE && URL_APPLICATION ? describe : describe.skip;

export function clientProprietaire(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: URL_PROPRIETAIRE } } });
}

export async function viderBase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE inscription, activite, referent, disponibilite, profil_benevole,
             evenement_intervention, ligne_cout, intervention, entretien_periodique, artisan,
             evenement_audit, document, donnees_sensibles, personne, menage, logement,
             immeuble, activation_module, adhesion, utilisateur, organisation RESTART IDENTITY CASCADE`);
}

export interface Arbre {
  association: string;
  antenne: string;
  groupe1: string;
  groupe2: string;
}

/** Crée une association, une antenne et deux groupes locaux (avec le propriétaire). */
export async function creerArbre(prisma: PrismaClient, slug: string): Promise<Arbre> {
  const association = randomUUID();
  const antenne = randomUUID();
  const groupe1 = randomUUID();
  const groupe2 = randomUUID();
  const base = { tenantId: association };
  await prisma.organisation.create({
    data: { ...base, id: association, type: 'ASSOCIATION', nom: `Asso ${slug}`, slug, chemin: `/${association}/` },
  });
  await prisma.organisation.create({
    data: {
      ...base, id: antenne, parentId: association, type: 'ANTENNE', nom: 'Antenne', slug: `${slug}-ant`,
      chemin: `/${association}/${antenne}/`,
    },
  });
  for (const [id, n] of [[groupe1, 1], [groupe2, 2]] as const) {
    await prisma.organisation.create({
      data: {
        ...base, id, parentId: antenne, type: 'GROUPE_LOCAL', nom: `Groupe ${n}`, slug: `${slug}-g${n}`,
        chemin: `/${association}/${antenne}/${id}/`,
      },
    });
  }
  return { association, antenne, groupe1, groupe2 };
}

/** Crée un utilisateur actif lié au sujet `sujet` et lui donne un rôle. */
export async function creerMembre(
  prisma: PrismaClient,
  tenantId: string,
  organisationId: string,
  role: RoleMembre,
  sujet: string,
): Promise<string> {
  const utilisateur = await prisma.utilisateur.upsert({
    where: { email: `${sujet}@exemple.org` },
    create: { email: `${sujet}@exemple.org`, nomAffiche: sujet, sujetIdentite: sujet, statut: 'ACTIF' },
    update: {},
  });
  await prisma.adhesion.create({ data: { tenantId, utilisateurId: utilisateur.id, organisationId, role } });
  return utilisateur.id;
}

/** Jeton de test lisible : « sujet » ou « sujet|mfa » (second facteur). */
export function jeton(sujet: string, secondFacteur = true): string {
  return `Bearer ${sujet}${secondFacteur ? '|mfa' : ''}`;
}

class FauxVerificateur extends VerificateurJeton {
  async verifier(brut: string): Promise<JetonVerifie> {
    const [sujet, acr] = brut.split('|');
    if (!sujet || sujet === 'invalide') throw new Error('jeton invalide');
    return { sujet, email: `${sujet}@exemple.org`, nom: sujet, acr };
  }
}

export class FauxFournisseur extends FournisseurIdentite {
  readonly invitations: Invitation[] = [];
  async inviter(invitation: Invitation): Promise<void> {
    this.invitations.push(invitation);
  }
}

export class FauxNotificateur extends Notificateur {
  readonly messages: Message[] = [];
  async envoyer(message: Message): Promise<void> {
    this.messages.push(message);
  }
}

export class FauxStockage extends Stockage {
  readonly objets = new Map<string, Buffer>();
  async deposer(cle: string, contenu: Buffer): Promise<void> {
    this.objets.set(cle, contenu);
  }
  async lienTemporaire(cle: string): Promise<string> {
    return `https://stockage.test/${cle}?signature=x`;
  }
}

class FauxAntivirus extends Antivirus {
  async analyser(contenu: Buffer) {
    return contenu.includes('EICAR')
      ? { sain: false as const, signature: 'Eicar-Test-Signature' }
      : { sain: true as const };
  }
}

export interface ApplicationDeTest {
  app: INestApplication;
  fournisseur: FauxFournisseur;
  stockage: FauxStockage;
  notificateur: FauxNotificateur;
}

export async function demarrerApplication(): Promise<ApplicationDeTest> {
  const config = chargerConfiguration({
    NODE_ENV: 'test',
    DATABASE_URL: URL_APPLICATION,
    OIDC_ISSUER: 'http://keycloak.test/realms/snl',
    OIDC_AUDIENCE: 'snl-api',
    S3_ENDPOINT: 'http://stockage.test',
    S3_BUCKET: 'documents',
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test',
    CLE_CHIFFREMENT_DONNEES: randomBytes(32).toString('base64'),
    TACHES_PLANIFIEES: 'false',
  });
  const fournisseur = new FauxFournisseur();
  const stockage = new FauxStockage();
  const notificateur = new FauxNotificateur();
  const module = await Test.createTestingModule({ imports: [AppModule.avec(config)] })
    .overrideProvider(VerificateurJeton).useValue(new FauxVerificateur())
    .overrideProvider(FournisseurIdentite).useValue(fournisseur)
    .overrideProvider(Stockage).useValue(stockage)
    .overrideProvider(Antivirus).useValue(new FauxAntivirus())
    .overrideProvider(Notificateur).useValue(notificateur)
    .compile();
  const app = module.createNestApplication({ bodyParser: false, logger: false });
  configurerApplication(app, config);
  await app.init();
  return { app, fournisseur, stockage, notificateur };
}
