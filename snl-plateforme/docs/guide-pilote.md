# Guide du pilote

Ce guide accompagne un premier essai de la plateforme dans un groupe local. Il s'adresse à deux publics : la personne qui installe (première partie) et l'équipe qui teste (seconde partie).

Le pilote se fait avec des **données fictives**. Aucune information réelle sur un ménage ou un locataire ne doit être saisie tant que SNL n'a pas validé le cadre juridique (registre des traitements, analyse d'impact, contrat d'hébergement).

## Partie 1 : installer

### Ce qu'il faut

Un ordinateur ou un serveur avec Docker et Docker Compose, 4 Go de mémoire libres et un accès à Internet pour télécharger les images et les signatures de l'antivirus. Compter une demi-heure la première fois.

### Étapes

1. Récupérer le dossier `snl-plateforme` et s'y placer.
2. Créer le fichier de configuration, puis remplacer chaque valeur `a-remplacer` :

   ```bash
   cp .env.example .env
   ```

   Les commandes à utiliser pour générer chaque secret sont indiquées dans le fichier, au-dessus de chaque valeur. Les clés du stockage ont un format imposé (`GK` suivi de 24 caractères pour la clé d'accès, 64 caractères pour le secret).

3. Démarrer l'ensemble :

   ```bash
   docker compose up -d --build
   ```

   Au premier démarrage, l'antivirus télécharge ses signatures : il faut parfois patienter quelques minutes avant que l'API ne démarre.

4. Créer l'association du pilote et son administrateur. Celui-ci reçoit aussitôt un courriel d'invitation :

   ```bash
   docker compose run --rm \
     -e DATABASE_URL="postgresql://snl_proprietaire:<POSTGRES_PASSWORD>@postgres:5432/snl" \
     -e KEYCLOAK_ADMIN_URL=http://keycloak:8080 \
     api node dist/scripts/creer-association.js \
     --nom "SNL Pilote" --slug snl-pilote \
     --admin-email prenom.nom@exemple.org --admin-nom "Prénom Nom"
   ```

5. Charger les données de démonstration (une antenne, deux groupes, des logements, des ménages fictifs, un artisan, un entretien, une activité, un parcours d'accueil ; modules Travaux, Bénévoles et Intégration activés) :

   ```bash
   docker compose run --rm \
     -e DATABASE_URL="postgresql://snl_proprietaire:<POSTGRES_PASSWORD>@postgres:5432/snl" \
     api node dist/scripts/donnees-demo.js --slug snl-pilote
   ```

### Adresses

| Service | Adresse |
| --- | --- |
| Plateforme | `http://localhost:3000` |
| Courriels envoyés (Mailpit) | `http://localhost:8025` |
| Administration de Keycloak | `http://localhost:8080` (compte `admin`, mot de passe `KEYCLOAK_ADMIN_PASSWORD`) |

En développement et pendant le pilote, **aucun courriel ne part réellement** : Mailpit les capture tous. C'est là qu'on trouve les invitations et les alertes.

### Vérifier l'installation

Une recette automatique rejoue le parcours complet (invitation, activation avec second facteur, signalement urgent avec photo, refus d'un fichier infecté, déconnexion). Elle se lance juste après les étapes 4 et 5, sur une installation neuve, avec l'adresse `camille.pilote@exemple.org` pour l'administrateur :

```bash
cd apps/web
npm install
URL_WEB=http://localhost:3000 URL_MAILPIT=http://localhost:8025 npm run test:recette
```

Elle crée des comptes de test : on la lance sur une installation de recette, puis on repart d'une installation vierge (`docker compose down -v`) pour le pilote lui-même.

## Partie 2 : tester

### Se connecter la première fois

1. Ouvrir le courriel d'invitation (dans Mailpit pendant le pilote) et suivre le lien.
2. Configurer une application d'authentification sur son téléphone (FreeOTP, Microsoft Authenticator…) en scannant le code affiché. Les bénévoles n'en ont pas besoin ; les coordinateurs, gestionnaires, travailleurs sociaux et administrateurs, si.
3. Choisir son mot de passe (12 caractères au moins).
4. Aller sur la plateforme et cliquer sur « Se connecter ».

### Parcours à essayer

Chaque rôle a quelques gestes à essayer. L'administrateur invite les autres membres de l'équipe pilote.

| Rôle | À essayer |
| --- | --- |
| Administrateur | Inviter l'équipe (menu Équipe), activer ou désactiver un module pour un groupe (menu Organisations), consulter le journal |
| Coordinateur | Désigner un parrain pour un nouveau bénévole, ajouter une fiche pratique pour son groupe, ajouter un logement, qualifier et confier un signalement, saisir une facture, programmer un entretien, proposer une activité, désigner un bénévole référent d'un ménage |
| Nouveau bénévole | Suivre son parcours d'accueil, signer la charte et l'engagement de confidentialité, chercher une réponse dans la foire aux questions |
| Bénévole | Signaler un problème avec une photo, s'inscrire au chantier de démonstration puis s'en désister, indiquer ses disponibilités, ajouter ses activités à son agenda |
| Travailleur social | Créer un ménage, ajouter ses membres, constater l'alerte de doublon, renseigner la situation sociale |

### Faire remonter ses retours

Pour chaque difficulté, noter en quelques lignes : ce qu'on cherchait à faire, ce qu'on a fait, ce qui s'est passé, et ce qu'on attendait. Une capture d'écran aide beaucoup. Les retours les plus utiles portent sur les mots employés, les étapes inutiles et ce qui manque pour le travail réel du groupe.

## Limites connues pendant le pilote

- Les locataires ne se connectent pas encore : ils seront concernés par l'espace locataire (module M6).
- Le second facteur est demandé par Keycloak, mais l'API ne l'exige pas encore (`EXIGER_SECOND_FACTEUR=false`) tant que le flux d'authentification renforcée n'est pas finalisé.
- Les alertes d'urgence partent à tous les coordinateurs et gestionnaires concernés ; il n'y a pas encore de planning d'astreinte.
- Les numéros d'urgence affichés sont à valider par SNL.
