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
- Score = precision geographique + bonus de rapidite.
- Le marqueur rouge est la reponse du joueur, le point jaune est la position attendue.
- Les joueurs jouent chacun leur tour, puis le plus gros score gagne.

## Pret pour Firebase

Le fichier `firebase-adapter.js` isole le futur branchement online.
Quand la config Firebase sera disponible, copier `firebase-config.example.js` en `firebase-config.js`, ajouter le SDK Firebase, puis brancher :

- creation/rejoindre une room ;
- synchronisation de l'etat de partie ;
- presence des joueurs ;
- validation serveur ou Firestore rules pour limiter la triche.

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

## Asset GPT Image

Image generee avec le skill `imagegen`, sauvegardee dans `assets/world-arena.png`.
