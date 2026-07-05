# Discord Vocal Stats Bot

Bot Discord de statistiques et de présence vocale écrit en TypeScript strict avec Drizzle ORM et SQLite. Il suit l'activité vocale des membres et fournit des indicateurs détaillés sur le temps passé en sourdine casque.

---

## Configuration (.env)

Créez un fichier `.env` à la racine avec les variables suivantes :

```ini
TOKEN=ton_token_discord
CLIENT_ID=id_du_bot
GUILD_ID=id_du_serveur
LOG_CHANNEL_ID=id_salon_logs_carlbot
STATS_ID=id_salon_annonces_stats
```

---

## Commandes Disponibles

* **/top** : Affiche le classement général des membres en vocal sur le serveur.
* **/stats `[cible]`** : Affiche les statistiques détaillées (temps total, répartition actif/sourdine casque, sessions, salon favori, tendance, graphiques d'activité sur 7 jours et badges virtuels).
* **/compare `<membre1>` `<membre2>`** : Compare les statistiques vocales de deux membres (temps total, actif, sourdine, salons favoris et temps passé ensemble/en tête-à-tête).
* **/insolite `<classement>`** : Affiche des classements insolites (insomniaques de nuit, connexions éclairs, temps passé seul, marathons).
* **/badges** : Affiche la liste des trophées / rôles virtuels du serveur et leurs détenteurs.
* **/records** : Affiche le Hall of Fame des records absolus du serveur.

---

## Lancement en Développement

```bash
# Installer les dépendances
pnpm install

# Formater le code avec Prettier
pnpm format

# Compiler et démarrer
pnpm run build
pnpm run start
```

---

## Déploiement avec Docker / Docker Compose

Le projet est configuré pour être conteneurisé facilement en montant la base de données dans un volume persistant.

1. Créez un dossier local pour persister la DB :
   ```bash
   mkdir data
   ```
2. Si vous migrez une ancienne base de données, copiez le fichier `database.sqlite` dans ce dossier `data/`.
3. Démarrez l'application avec Docker Compose :
   ```bash
   docker compose up -d --build
   ```
   *(Le conteneur utilise automatiquement le volume `./data` mappé sur `/app/data` et charge la configuration depuis le fichier `.env`)*.
