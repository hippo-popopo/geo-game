# Geo Duel

Prototype de jeu de geographie multijoueur : chaque joueur doit placer un pays sur la carte du monde a partir d'un drapeau, d'une capitale ou du nom du pays.

## Lancer en local

```bash
python3 -m http.server 5174
```

Puis ouvrir `http://localhost:5174/geo-duel/`.

## Regles actuelles

- 1 a plusieurs joueurs en local.
- Modes melanges : drapeau, capitale, nom.
- Score = 100 points si le pays clique est le bon, plus 10 points par seconde restante.
- Mauvais pays ou temps ecoule = 0 point.
- Les joueurs jouent chacun leur tour, puis le plus gros score gagne.

## Rooms online

Le systeme online reprend le modele de `tempo-heist` :

- `firebase-config.js` contient l'URL Realtime Database.
- Les rooms sont stockees dans `/geo-duel/rooms/CODE`.
- Chaque joueur a un `playerId` local en `sessionStorage`.
- L'hote cree la room, partage le code, puis lance la partie.
- Les autres rejoignent avec le code et suivent l'etat par polling.

Encore a durcir avant publication large :

- presence des joueurs ;
- validation serveur ou regles plus strictes pour limiter la triche.

## Deploiement Firebase Hosting

1. Creer un projet sur https://console.firebase.google.com/
2. Ajouter une app Web dans le projet.
3. Copier la config SDK dans `firebase-config.js`.
4. Installer/ouvrir Firebase CLI puis lancer :

```bash
firebase login
firebase init hosting
firebase deploy
```

Le fichier `firebase.json` est deja pret pour servir le dossier courant.

Pour activer les rooms online, ouvrir l'onglet Rules de la Realtime Database et coller le contenu de `database.rules.json`, ou lancer :

```bash
firebase deploy --only database
```

Ces regles sont volontairement ouvertes pour le prototype. Avant une vraie mise en public, il faudra ajouter une limite de taille, une expiration des rooms et une validation plus stricte.

## Asset GPT Image

Image generee avec le skill `imagegen`, sauvegardee dans `assets/world-arena.png`.
