# Mon Widget de bureau

Un petit widget que tu peux placer n'importe où sur ton écran Windows : horloge, date, météo, notes et mini-calendrier.

## 1. Installer les outils nécessaires (une seule fois)

1. Télécharge et installe **Node.js** (version LTS) : https://nodejs.org
   → Pendant l'installation, laisse toutes les options par défaut.
2. Vérifie que ça a marché : ouvre l'invite de commandes (`cmd` ou PowerShell) et tape :
   ```
   node -v
   npm -v
   ```
   Tu dois voir deux numéros de version s'afficher.

## 2. Installer le projet

1. Décompresse le dossier `mon-widget` quelque part (ex: `Documents\mon-widget`).
2. Ouvre l'invite de commandes **dans ce dossier** :
   - Ouvre le dossier dans l'explorateur Windows
   - Clique dans la barre d'adresse, tape `cmd`, appuie sur Entrée
3. Installe les dépendances (télécharge Electron) :
   ```
   npm install
   ```
   Ça prend 1 à 2 minutes la première fois.

## 3. Lancer le widget

```
npm start
```

La fenêtre apparaît en haut à gauche de ton écran. Tu peux :
- **La déplacer** : clique-glisse sur la petite barre grise en haut (à côté du point bleu)
- **La fermer** : bouton `×` en haut à droite
- **La réduire** : bouton `–`
- **Régler la ville météo et l'opacité** : bouton `⚙`
- **Redimensionner** : tire un des bords de la fenêtre

Tes notes et ta ville sont sauvegardées automatiquement (même après fermeture).

## 4. (Optionnel) Faire un .exe pour ne plus taper de commande

```
npm run build
```

Un fichier `.exe` portable sera généré dans le dossier `dist/`. Tu pourras double-cliquer dessus directement, ou même le mettre au démarrage de Windows (`touche Windows + R`, tape `shell:startup`, et colle un raccourci du `.exe` dedans).

## 5. Pour aller plus loin (idées d'ajouts)

- Ajouter un onglet "tâches à faire" (liste à cocher)
- Changer les couleurs dans `style.css` (cherche les codes `#6c8cff`)
- Ajouter la météo sur 3 jours (l'API Open-Meteo le permet gratuitement)
- Faire plusieurs "thèmes" au choix dans les réglages

Tous les fichiers sont commentés en français pour que tu puisses les modifier facilement :
- `main.js` → comportement de la fenêtre (taille, position, transparence)
- `index.html` → contenu affiché
- `style.css` → apparence (couleurs, tailles, arrondis)
- `renderer.js` → logique (horloge, météo, notes, calendrier)
