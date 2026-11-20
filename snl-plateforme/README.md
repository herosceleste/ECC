# Plateforme numérique SNL : socle M0

Ce dossier contient le socle de la plateforme modulaire imaginée pour Solidarités Nouvelles pour le Logement : identité et droits, arborescence des organisations, référentiel des logements et des personnes, documents, activation des modules et journal d'audit, avec son interface web. Les modules métier (M1 à M14) viendront s'y brancher.

Il s'agit d'une initiative bénévole, pas encore validée par SNL. Les choix décrits ici suivent le document d'architecture et le cahier des charges rédigés en amont.

## État d'avancement

Le socle couvre les exigences suivantes du cahier des charges.

| Exigence | Contenu | État |
| --- | --- | --- |
| M0-F01 | Invitation par courriel (lien Keycloak à usage unique), suspension, réactivation | Fait |
| M0-F02 | Rôles multiples, chacun rattaché à une organisation | Fait |
| M0-F03 | Arborescence association, antenne, groupe local | Fait |
| M0-F04 | Référentiel immeubles, logements, ménages, personnes | Fait |
| M0-F05 | Dépôt, versionnement et téléchargement de documents, avec antivirus | Fait |
| M0-F06 | Consultation filtrée du journal d'audit | Fait |
| M0-F07 | Notifications courriel, SMS et application | À faire |
| M0-F08 | Activation des modules par organisation, avec héritage | Fait |
| M0-F09 | Recherche dans le périmètre autorisé | Fait (logements, personnes) |
| M0-F10 | Export des données d'une personne | Fait (rectification et effacement : routes existantes) |
| M0-F11 | Personnalisation par organisation | À faire |
| M0-R01 | Détection des doublons de personnes | Fait |
| M0-R02 | Suppression logique puis purge à 30 jours | Fait (script `purger`) |
| M0-R03 | Suspension automatique après 12 mois sans connexion | À faire |
| M0-R04 | Rôles modifiables par les seuls administrateurs, avec audit | Fait |
| T-03 | Second facteur obligatoire pour les rôles sensibles | Fait côté API, flux Keycloak à finaliser |
| T-04, T-05 | Contrôle d'accès serveur, journalisation des accès | Fait |

## Interface web

L'interface (Next.js 15, React 19) couvre le socle : connexion, choix de l'association, accueil, organisations et modules, logements et immeubles, ménages et personnes (doublons, données sensibles, export, suppression), documents, équipe (invitations, rôles, suspension), journal d'audit et recherche.

Quelques choix structurants :

- **Les jetons ne quittent jamais le serveur.** Le serveur Next conduit la connexion OIDC avec PKCE et garde les jetons dans un cookie chiffré (AES-256-GCM), inaccessible au JavaScript de la page. Il appelle l'API pour le compte de l'utilisateur et renouvelle le jeton avant son expiration.
- **Une politique de sécurité du contenu stricte** : seuls les scripts portant le nonce de la requête s'exécutent.
- **Les droits affichés ne sont qu'un confort.** L'interface masque les actions impossibles, mais l'API reste seule juge et refuse toute action non autorisée.
- **Accessibilité** : navigation au clavier, lien d'évitement, erreurs reliées aux champs, annonces aux lecteurs d'écran, contrastes AA, affichage sur téléphone, thème sombre. Les tests de bout en bout vérifient l'absence de violation grave avec axe-core ; un audit RGAA humain reste nécessaire.
- **Données sensibles à la demande** : la situation sociale d'une personne ne s'affiche qu'après un clic explicite, car chaque consultation est journalisée.
- **Pas de DSFR** : le système de design de l'État est réservé aux sites publics. L'interface utilise sa propre charte, sans dépendance.

## Organisation du code

```text
snl-plateforme/
├── apps/web/                 interface Next.js (pages, actions serveur, session)
├── apps/api/                 API NestJS du socle
│   ├── prisma/               schéma et migrations (dont la sécurité RLS)
│   ├── src/
│   │   ├── auth/             jeton OIDC, garde, invitation Keycloak
│   │   ├── autorisation/     rôles, périmètres, contrôles d'accès
│   │   ├── audit/            journal d'audit et intercepteur
│   │   ├── organisations/    arborescence
│   │   ├── modules-plateforme/ activation des modules
│   │   ├── utilisateurs/     comptes, rôles, invitations
│   │   ├── referentiel/      immeubles, logements, ménages, personnes, recherche
│   │   ├── documents/        dépôt, antivirus, stockage S3
│   │   └── scripts/          création d'association, purge
│   └── test/                 tests unitaires et d'intégration
├── packages/shared/          rôles, permissions et codes de modules partagés
├── infra/                    initialisation PostgreSQL, royaume Keycloak
└── docker-compose.yml        environnement de développement complet
```

## Principes de sécurité

Trois protections se superposent, de sorte qu'une erreur dans l'une ne suffit pas à exposer des données.

1. **Cloisonnement par association dans PostgreSQL.** Chaque table métier porte un `tenant_id` et une politique RLS. L'API se connecte avec le rôle `snl_app`, qui n'est pas propriétaire des tables et ne voit que les lignes de l'association fixée pour la transaction.
2. **Périmètre par organisation dans l'API.** Un rôle s'applique à son organisation et à ses descendantes. Hors de ce périmètre, une ressource est déclarée introuvable plutôt qu'interdite, pour ne pas révéler son existence.
3. **Journal d'audit en ajout seul.** Chaque consultation ou modification de données personnelles, réussie ou refusée, est tracée. Le rôle applicatif n'a pas le droit de modifier ni d'effacer ce journal.

Les données sociales et financières sont chiffrées par l'application (AES-256-GCM), liées à la personne concernée, et réservées aux travailleurs sociaux. Les documents sont contrôlés (type réel, taille, antivirus) avant tout stockage et ne sont servis que par des liens signés de cinq minutes.

## Démarrage en local

Prérequis : Docker et Docker Compose.

```bash
cp .env.example .env          # puis remplacer chaque « a-remplacer »
docker compose up -d --build
```

Les services démarrent sur les ports suivants, accessibles uniquement depuis la machine locale.

| Service | Adresse |
| --- | --- |
| Interface web | `http://localhost:3000` |
| API | `http://localhost:3001` (sonde : `/sante`, routes : `/api/v1/…`) |
| Keycloak | `http://localhost:8080` |
| Console MinIO | `http://localhost:9001` |
| Courriels de test (Mailpit) | `http://localhost:8025` |

Une nouvelle association se crée en ligne de commande, avec la connexion du propriétaire de la base :

```bash
docker compose run --rm -e DATABASE_URL="postgresql://snl_proprietaire:<mot de passe>@postgres:5432/snl" \
  api node dist/scripts/creer-association.js \
  --nom "SNL Essonne" --slug snl-essonne \
  --admin-email admin@exemple.org --admin-nom "Camille Martin"
```

L'administrateur se connecte ensuite avec la même adresse : sa première connexion rattache son compte Keycloak à son compte de la plateforme. Toutes les requêtes métier portent l'en-tête `X-Association` avec l'identifiant de l'association.

## Développement et tests

Prérequis : Node.js 22 et PostgreSQL 16.

```bash
npm install
npm run build -w @snl/shared
npm test                      # tests unitaires
```

Les tests d'intégration s'exécutent contre une vraie base, migrée au préalable, avec deux connexions : celle du propriétaire et celle du rôle `snl_app`.

```bash
cd apps/api
DATABASE_URL="postgresql://snl_proprietaire:…@localhost:5432/snl_test" npx prisma migrate deploy
DATABASE_URL_PROPRIETAIRE="postgresql://snl_proprietaire:…@localhost:5432/snl_test" \
DATABASE_URL="postgresql://snl_app:…@localhost:5432/snl_test" \
npm run test:integration
```

Ils vérifient notamment l'isolation entre associations au niveau de la base, le périmètre des droits, la détection des doublons, le chiffrement, le refus des fichiers infectés et l'impossibilité de falsifier le journal d'audit.

L'interface a ses propres tests unitaires (`npm test -w @snl/web`) et des tests de bout en bout dans un vrai navigateur. Ces derniers démarrent l'API, l'interface et un faux fournisseur d'identité qui signe de vrais jetons, sur une base de démonstration recréée à chaque lancement :

```bash
npm run build -w @snl/api && npm run build -w @snl/web
cd apps/web
DATABASE_URL_PROPRIETAIRE="postgresql://snl_proprietaire:…@localhost:5432/snl_test" \
DATABASE_URL_APPLICATION="postgresql://snl_app:…@localhost:5432/snl_test" \
npm run test:e2e
```

Ils parcourent les rôles de bénévole, coordinateur, travailleur social et administrateur, et vérifient au passage l'accessibilité de chaque écran visité.

## Points ouverts

- Le dépôt de documents n'est pas couvert par les tests de bout en bout (il exige MinIO et ClamAV) ; il l'est par les tests d'intégration de l'API.
- Configurer dans Keycloak le flux d'authentification renforcée qui émet `acr=mfa` après un second facteur. En attendant, `EXIGER_SECOND_FACTEUR=false` en développement.
- Prisma 6 signale des vulnérabilités dans ses dépendances de développement (outil de migration). Elles ne sont pas embarquées dans l'image d'exécution ; la migration vers Prisma 7 est à planifier.
- Les fichiers déposés pour une personne purgée restent dans le stockage : leur suppression est à ajouter au script de purge.
- Les durées de conservation, la liste des catégories de documents et les objectifs de disponibilité restent à fixer avec SNL.
