# Discord Vocal Stats Bot

Bot Discord de statistiques et de presence vocale ecrit en TypeScript strict avec Drizzle ORM et SQLite. Il suit l'activite vocale des membres et fournit des indicateurs detailles sur le temps passe en vocal, la continuite des sessions et le temps passe en sourdine casque.

---

## Configuration (.env)

Creez un fichier `.env` a la racine avec les variables suivantes :

```ini
TOKEN=ton_token_discord
CLIENT_ID=id_du_bot
GUILD_ID=id_du_serveur
LOG_CHANNEL_ID=id_salon_logs_carlbot
STATS_ID=id_salon_annonces_stats
ADMIN_ID=ton_id_discord_admin
ENABLE_CARL_CATCHUP=false
GEMINI_API_KEY=cle_api_google_ai_studio
GEMINI_MODEL=gemini-2.5-flash
AI_VIP_ROLE_ID=id_role_illimite
AI_DAILY_QUOTA=5
```

- **LOG_CHANNEL_ID** : Salon recevant les logs de connexions et deconnexions vocales de Carl-bot.
- **ENABLE_CARL_CATCHUP** : Variable optionnelle (`false` par defaut). Lorsqu'elle est activee (`true`), le bot lit ce salon au demarrage pour rattraper les evenements qui auraient pu avoir lieu pendant une coupure.
- **GEMINI_API_KEY** : Cle d'API Google AI Studio pour la generation des resumes par intelligence artificielle.
- **GEMINI_MODEL** : Modele Gemini utilise (`gemini-2.5-flash` par defaut).
- **AI_VIP_ROLE_ID** : Identifiant de role Discord accordant un acces illimite aux resumes IA.
- **AI_DAILY_QUOTA** : Nombre de resumes IA autorises par jour pour les membres standards (valeur par defaut : 5).

---

## Commandes Disponibles

### Statistiques et Classements Globaux

- **/top** : Affiche le classement general des membres en vocal sur le serveur avec pagination interactive.
- **/stats `[cible]`** : Affiche les statistiques detaillees d'un membre (temps total, repartition actif/sourdine casque, nombre de sessions, record, salon favori, tendance, serie de jours consecutifs, progression en succes et graphique sur 7 jours).
- **/compare `<membre1>` `<membre2>`** : Compare les statistiques vocales de deux membres (temps total, actif, sourdine, salons favoris, temps partage en simultane et temps passe seul).
- **/records** : Affiche le Hall of Fame des records absolus du serveur (session la plus longue, session sourdine la plus longue, plus grand nombre de sessions, record de temps actif).
- **/badges** : Affiche la liste des trophees et roles virtuels du serveur avec leurs detenteurs.
- **/insolite `<classement>`** : Affiche des classements thematiques (insomniaques de nuit, connexions eclairs, temps passe seul, marathons).

### Succes (Achievements)

- **/achievements me `[categorie]`** : Affiche la progression personnelle et le resume des succes debloques, ou la liste detaillee filtree par categorie (temps total, marathons, horaires, sourdine/afk, solitaire, duo, speciaux, technique/skill).
- **/achievements user `<membre>` `[categorie]`** : Affiche la progression et les succes d'un autre membre du serveur.
- **/achievements server** : Statistiques globales des succes sur le serveur (nombre total de debloquages, top 3 des chasseurs, top 5 des succes les plus rares et leurs detenteurs).

### Retrospectives et Bilans Temporels

- **/wrapped `[annee]` `[cible]`** : Retrospective annuelle personnalisee (volume d'heures, pourcentage de l'annee en vocal, rang annuel, archetype vocal, salon favori, mois et journee records, ame soeur vocale et partenaires les plus frequents). L'annee 2026 reste verrouillee jusqu'au 1er decembre 2026.
- **/annual leaderboard `<annee>`** : Classement complet des membres sur une annee specifique avec pagination (donnees 2026 verrouillees jusqu'au 1er decembre 2026).
- **/annual server `<annee>`** : Bilan global d'activite du serveur sur une annee (heures cumulees par la communaute, membres uniques, salon le plus frequente, journee record). Donnees 2026 verrouillees jusqu'au 1er decembre 2026.
- **/monthly leaderboard `<mois>` `<annee>`** : Classement complet des membres sur un mois precis avec pagination par boutons.
- **/monthly me `<mois>` `<annee>` `[cible]`** : Fiche statistique individuelle sur un mois donne (temps total, rang du mois, nombre de sessions, salon favori).
- **/trends chart `<annee>` `[cible]`** : Graphique d'activite mois par mois en barres textuelles ASCII sur une annee (donnees 2026 verrouillees jusqu'au 1er decembre 2026).
- **/trends year `[cible]`** : Comparaison directe de la presence vocale d'un membre entre 2025 et 2026 (evolution en pourcentage, gain ou perte d'heures, evolution du rang). Donnees 2026 verrouillees jusqu'au 1er decembre 2026.

### Affinites et Series Vocales (Flammes)

- **/duo check `<membre1>` `[membre2]`** : Calcule l'alchimie et la compatibilite vocale entre deux membres (pourcentage d'affinite pondere, temps partage, salon favori commun, creneau horaire habituel et titre du duo). Si `membre2` est omis, la comparaison s'effectue avec l'auteur de la commande.
- **/duo match `[cible]`** : Recherche algorithmique du meilleur binome vocal sur le serveur.
- **/streak me `[cible]`** : Serie de jours consecutifs de presence vocale en cours, record personnel et indicateur des 7 derniers jours.
- **/streak duo `<membre1>` `[membre2]`** : Serie de jours consecutifs partages en vocal entre deux membres.
- **/streak leaderboard** : Classement des plus longues series de flammes actives du serveur.
- **/streak records `[type]`** : Classement des records historiques de flammes, avec choix entre les records personnels (`Solo`) et les records de duos (`Duo`).

### Intelligence Artificielle (Resume de Discussions)

- **/resume `[messages]` `[depuis_heures]` `[depuis_date]` `[depuis_message]` `[membre]` `[sujet]` `[style]` `[inclure_bots]`** : Resume et analyse les echanges d'un salon textuel via Google Gemini.
    - **Filtres temporels et de volume** : Nombre de messages (10 a 500), heures ecoulees, date ou heure specifique (ex: `14:30`, `hier 20:00`, `30/10/2026`), ou message de reference (ID ou lien Discord).
    - **Filtres de contenu** : Filtrage par membre cible, focalisation sur un sujet ou mot-cle, exclusion ou inclusion des bots.
    - **Styles redacteurs** : Synthese equilibree, TL;DR express, Drama & Potins, Roast sarcastique, Analyse de debat, Chronologie, Proces-verbal officiel.
    - **Quotas** : Quota quotidien configurable (`AI_DAILY_QUOTA`), avec acces illimite pour l'administrateur et le role VIP (`AI_VIP_ROLE_ID`).

---

## Taches Automatisees (Cron)

Le planificateur interne execute automatiquement les taches suivantes selon le fuseau horaire `Europe/Paris` :

- **Snapshots hebdomadaires** : Tous les lundis a 04h00, capture de l'etat du classement pour le calcul des tendances.
- **Snapshots mensuels** : Le 1er de chaque mois a 04h00.
- **Gazette mensuelle** : Le 1er de chaque mois a 12h00, publication du bilan du mois ecoule et du top 5 dans le salon des statistiques.
- **Grande Gazette annuelle** : Le 1er janvier a 12h00, publication du bilan annuel de la communaute et du top 10 dans le salon des statistiques.

---

## Scripts et Maintenance

### Recalcul de l'Historique des Succes

Pour synchroniser ou recalculer les succes de l'ensemble des membres a partir de l'historique complet des sessions stockees en base :

```bash
node dist/index.js --sync-achievements
```

---

## Lancement en Developpement

```bash
pnpm install
pnpm format
pnpm run build
pnpm run start
```

---

## Deploiement avec Docker / Docker Compose

Le projet est configure pour etre conteneurise en montant la base de donnees dans un volume persistant.

1. Creez un dossier local pour persister la base de donnees :
    ```bash
    mkdir data
    ```
2. Si vous migrez une ancienne base de donnees, copiez le fichier `database.sqlite` dans ce dossier `data/`.
3. Demarrez l'application avec Docker Compose :
    ```bash
    docker compose up -d --build
    ```
    Le conteneur utilise automatiquement le volume `./data` mappe sur `/app/data` et charge la configuration depuis le fichier `.env`.
