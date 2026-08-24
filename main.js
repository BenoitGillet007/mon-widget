const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let win;          // la fenêtre principale (infos)
let settingsWin;  // la fenêtre réglages (indépendante, créée à la demande)

// Fichier où l'on sauvegarde la position/taille de la fenêtre entre les lancements
const statePath = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return { x: 60, y: 60, width: 340, height: 480 };
  }
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  try {
    fs.writeFileSync(statePath, JSON.stringify(bounds));
  } catch (err) {
    // pas grave si ça échoue, on garde juste la position par défaut la prochaine fois
  }
}

function createWindow() {
  const state = loadWindowState();

  win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    frame: false,          // pas de barre de titre Windows
    transparent: true,     // fond transparent -> on gère l'apparence en CSS
    alwaysOnTop: true,     // toujours visible au-dessus des autres fenêtres
    resizable: true,
    skipTaskbar: false,    // mets "true" si tu ne veux pas l'icône dans la barre des tâches
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  Menu.setApplicationMenu(null); // enlève le menu Fichier/Edition par défaut
  win.loadFile('index.html');

  // Sauvegarde la position/taille à chaque déplacement, redimensionnement, et fermeture
  win.on('moved', saveWindowState);
  win.on('resized', saveWindowState);
  win.on('close', saveWindowState);
}

// La fenêtre réglages a une taille fixe, indépendante de la fenêtre principale,
// suffisamment grande pour afficher toutes les options sans être coupée.
function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }

  const SETTINGS_WIDTH = 300;
  const SETTINGS_HEIGHT = 600;

  const mainBounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: mainBounds.x, y: mainBounds.y });
  const workArea = display.workArea;

  // Positionne la fenêtre réglages à droite de la fenêtre principale,
  // ou à gauche si elle sortirait de l'écran
  let x = mainBounds.x + mainBounds.width + 12;
  if (x + SETTINGS_WIDTH > workArea.x + workArea.width) {
    x = mainBounds.x - SETTINGS_WIDTH - 12;
  }
  let y = mainBounds.y;
  if (y + SETTINGS_HEIGHT > workArea.y + workArea.height) {
    y = Math.max(workArea.y, workArea.y + workArea.height - SETTINGS_HEIGHT);
  }

  settingsWin = new BrowserWindow({
    x, y,
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 260,
    minHeight: 400,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  settingsWin.loadFile('settings.html');
  settingsWin.on('closed', () => { settingsWin = null; });
}

app.whenReady().then(() => {
  createWindow();

  // Vérifie automatiquement les mises à jour au démarrage.
  // Ne fonctionne que sur une version installée (pas en "npm start" pendant le développement).
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
    // Revérifie ensuite toutes les 4 heures, au cas où le widget reste ouvert longtemps
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000);
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

// Boutons de la fenêtre (fermer / réduire) pilotés depuis index.html
ipcMain.on('close-app', () => app.quit());
ipcMain.on('minimize-app', () => win.minimize());

// Ouverture / fermeture de la fenêtre réglages (indépendante)
ipcMain.on('open-settings', () => createSettingsWindow());
ipcMain.on('close-settings', () => { if (settingsWin) settingsWin.close(); });

// Opacité de la fenêtre principale (pilotée depuis les réglages)
ipcMain.on('set-opacity', (event, value) => {
  win.setOpacity(value);
});

// Relaie un changement fait dans la fenêtre réglages vers la fenêtre principale,
// qui applique le changement immédiatement (les deux fenêtres ne partageant pas
// automatiquement leur stockage local, on passe explicitement par ce canal).
ipcMain.on('settings-update', (event, payload) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('settings-update', payload);
  }
});

// Quand la fenêtre réglages s'ouvre, elle demande l'état actuel à la fenêtre
// principale pour préremplir ses champs correctement
ipcMain.on('request-current-settings', (event) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('send-current-settings');
  }
});
ipcMain.on('current-settings-response', (event, payload) => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('current-settings-response', payload);
  }
});

// Verrouille/déverrouille le déplacement et le redimensionnement de la fenêtre principale
ipcMain.on('set-locked', (event, locked) => {
  win.setMovable(!locked);
  win.setResizable(!locked);
  saveWindowState();
});

// Démarrage automatique avec Windows (activable/désactivable depuis les réglages)
ipcMain.handle('get-startup', () => {
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.on('set-startup', (event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
  });
});

// Ajuste automatiquement la hauteur de la fenêtre principale selon le contenu affiché
// (envoyé par renderer.js à chaque fois que des sections sont montrées/masquées).
// Ceci ne concerne QUE la fenêtre principale ; la fenêtre réglages a sa propre taille fixe.
ipcMain.on('resize-window', (event, dims) => {
  if (!win || win.isDestroyed()) return;
  const [currentWidth] = win.getSize();
  const newHeight = dims.height !== undefined ? Math.max(Math.round(dims.height), 140) : win.getSize()[1];
  win.setSize(currentWidth, newHeight);
  saveWindowState();
});