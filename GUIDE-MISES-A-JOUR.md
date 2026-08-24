# Créer un installeur avec mises à jour automatiques

## Vue d'ensemble

- **electron-builder** transforme ton projet en un vrai fichier `Mon Widget Setup 1.0.0.exe` (assistant d'installation classique, raccourci bureau, etc.)
- **electron-updater** fait tourner en tâche de fond, dans l'app installée, une vérification "y a-t-il une version plus récente ?"
- **GitHub Releases** héberge gratuitement les fichiers `.exe` que tu publies — c'est electron-builder qui les y dépose automatiquement, tu n'as rien à faire manuellement

Résultat : tu changes une ligne de code un jour, tu relances une commande, et **tous les gens qui ont déjà installé le widget reçoivent la mise à jour tout seuls**, sans rien faire.

---

## Étape 1 — Créer le dépôt GitHub

1. Va sur https://github.com/new
2. Nom du dépôt : `mon-widget` (ou autre nom, mais retiens-le)
3. Visibilité : **Public** (nécessaire — les mises à jour automatiques gratuites ne fonctionnent que sur un dépôt public)
4. Ne coche aucune case d'initialisation (pas de README, pas de .gitignore) — laisse vide
5. Clique "Create repository"

## Étape 2 — Modifier `package.json` avec tes infos

Ouvre `package.json` et remplace `TON-PSEUDO-GITHUB` par ton vrai nom d'utilisateur GitHub :

```json
"publish": [
  {
    "provider": "github",
    "owner": "TON-PSEUDO-GITHUB",
    "repo": "mon-widget"
  }
]
```

## Étape 3 — Envoyer le code sur GitHub

Dans le terminal, à la racine du dossier `mon-widget` :

```
git init
git add .
git commit -m "Premier envoi"
git branch -M main
git remote add origin https://github.com/TON-PSEUDO-GITHUB/mon-widget.git
git push -u origin main
```

(Remplace bien `TON-PSEUDO-GITHUB` dans cette commande aussi.)

## Étape 4 — Créer un token d'accès GitHub

C'est ce qui autorise ton ordinateur à publier des releases automatiquement.

1. Va sur https://github.com/settings/tokens/new
2. Note : "electron-builder publish"
3. Expiration : ce que tu veux (90 jours, ou "No expiration")
4. Coche uniquement la case **`repo`** (accès complet aux dépôts)
5. Clique "Generate token" tout en bas
6. **Copie le token affiché tout de suite** (il ne sera plus jamais réaffiché)

## Étape 5 — Installer les nouvelles dépendances

```
npm install
```

(Ça installera `electron-updater` en plus de ce que tu avais déjà.)

## Étape 6 — Publier la première version

Toujours dans le terminal, dans le dossier du projet :

**PowerShell :**
```
$env:GH_TOKEN="colle_ton_token_ici"
npm run publish
```

**cmd :**
```
set GH_TOKEN=colle_ton_token_ici
npm run publish
```

Ça va prendre 1 à 2 minutes : electron-builder construit l'installeur `.exe`, crée automatiquement une "Release" sur ton GitHub, et y dépose le fichier.

Va vérifier sur `https://github.com/TON-PSEUDO-GITHUB/mon-widget/releases` — tu devrais voir la version 1.0.0 avec le fichier `.exe` attaché.

## Étape 7 — Installer le widget comme un utilisateur normal

Télécharge ce `.exe` depuis la page Releases et double-clique dessus : ça installe le widget normalement (raccourci bureau, désinstallation possible depuis "Applications" Windows).

---

## Publier une mise à jour (à chaque fois que tu modifies le widget)

1. Modifie ton code comme d'habitude
2. Ouvre `package.json` et **augmente le numéro de version**, par exemple `"1.0.0"` → `"1.0.1"` (obligatoire : electron-updater compare les numéros de version pour savoir si une mise à jour existe)
3. Relance :
   ```
   $env:GH_TOKEN="ton_token"
   npm run publish
   ```
4. C'est tout. Dans les prochaines minutes/heures, toute personne qui a l'app installée et ouverte va automatiquement télécharger la 1.0.1 en arrière-plan, et elle s'installera toute seule la prochaine fois qu'elle relance le widget.

## Notes importantes

- **`npm run build`** (sans "publish") construit juste l'installeur en local dans `dist/`, sans rien envoyer sur GitHub — utile pour tester avant de publier.
- Le token GH_TOKEN n'est utilisé que sur TON ordinateur, au moment de publier. Il n'est jamais inclus dans l'app elle-même — les utilisateurs n'ont besoin d'aucun compte GitHub pour recevoir les mises à jour.
- Si tu perds ton token, génère-en simplement un nouveau (étape 4).
- Les mises à jour ne fonctionnent que sur la version **installée** via le `.exe` — pas quand tu lances avec `npm start` en développement.
