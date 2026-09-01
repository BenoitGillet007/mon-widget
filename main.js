const { app, BrowserWindow, ipcMain, Menu, screen, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let win;          // la fenêtre principale (infos)
let settingsWin;  // la fenêtre réglages (indépendante, créée à la demande)
let tray;         // icône dans la zone de notification (barre des tâches)
let isQuitting = false; // devient true uniquement quand on choisit "Quitter" dans le tray

// Fichier de journal pour diagnostiquer le système de mise à jour automatique
const updateLogPath = path.join(app.getPath('userData'), 'update-log.txt');
function logUpdate(message) {
  try {
    fs.appendFileSync(updateLogPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch (err) {
    // pas grave si l'écriture du log échoue
  }
}

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
    alwaysOnTop: false,    // sera activé automatiquement si la fenêtre est verrouillée (voir set-locked)
    resizable: true,
    skipTaskbar: false,    // mets "true" si tu ne veux pas l'icône dans la barre des tâches
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,   // la page n'a plus d'accès direct à Node.js
      contextIsolation: true,   // la page ne peut utiliser que window.api (voir preload.js)
    },
  });

  Menu.setApplicationMenu(null); // enlève le menu Fichier/Edition par défaut
  win.loadFile('index.html');

  // Sauvegarde la position/taille à chaque déplacement, redimensionnement, et fermeture
  win.on('moved', saveWindowState);
  win.on('resized', saveWindowState);

  // Fermer la fenêtre (× ou Alt+F4) cache simplement le widget dans le tray,
  // au lieu de quitter l'application. Seul le "Quitter" du menu du tray quitte vraiment.
  win.on('close', (event) => {
    saveWindowState();
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
}

// Icône dans la zone de notification (barre des tâches), avec menu clic droit
function createTray() {
  const trayIconPath = path.join(__dirname, 'assets', 'tray-icon.png');

  if (!fs.existsSync(trayIconPath)) {
    logUpdate(`ERREUR tray: fichier introuvable à ${trayIconPath}`);
    console.error('Icône du tray introuvable :', trayIconPath);
    return; // le widget continue de fonctionner normalement, juste sans icône de tray
  }

  try {
    tray = new Tray(trayIconPath);
  } catch (err) {
    logUpdate(`ERREUR tray: ${err && err.message ? err.message : err}`);
    console.error('Impossible de créer le tray :', err);
    return;
  }

  tray.setToolTip('Mon Widget');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Afficher / Masquer', click: () => {
        if (win.isVisible()) win.hide();
        else { win.show(); win.focus(); }
      },
    },
    { type: 'separator' },
    {
      label: 'Quitter', click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  // Un simple clic (gauche) sur l'icône affiche/cache aussi le widget
  tray.on('click', () => {
    if (win.isVisible()) win.hide();
    else { win.show(); win.focus(); }
  });
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  settingsWin.loadFile('settings.html');
  settingsWin.on('closed', () => { settingsWin = null; });
}

// Se déclenche systématiquement AVANT toute fermeture légitime de l'application,
// y compris quand Windows s'éteint/redémarre et essaie de fermer proprement tous
// les programmes ouverts. Sans ça, notre gestionnaire de fermeture (qui cache
// normalement le widget dans le tray au lieu de le fermer) bloquerait cette
// fermeture, et Windows finirait par tuer le processus de force au bout d'un
// délai — ce qui provoque un plantage brutal au lieu d'une fermeture propre.
app.on('before-quit', () => {
  isQuitting = true;
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Vérifie automatiquement les mises à jour au démarrage.
  // Ne fonctionne que sur une version installée (pas en "npm start" pendant le développement).
  logUpdate(`Démarrage. app.isPackaged=${app.isPackaged}. Version actuelle=${app.getVersion()}`);
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
    // Revérifie ensuite toutes les 4 heures, au cas où le widget reste ouvert longtemps
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000);
  } else {
    logUpdate('Mode développement (non packagé) : vérification des mises à jour ignorée.');
  }
});

// Informe visuellement la fenêtre principale de l'avancement de la mise à jour
function notifyUpdateStatus(status, message) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('update-status', { status, message });
  }
}

autoUpdater.on('checking-for-update', () => {
  logUpdate('checking-for-update');
  notifyUpdateStatus('checking', 'Vérification des mises à jour…');
});
autoUpdater.on('update-available', (info) => {
  logUpdate(`update-available: version=${info.version}`);
  notifyUpdateStatus('available', `Mise à jour ${info.version} trouvée, téléchargement…`);
});
autoUpdater.on('update-not-available', (info) => {
  logUpdate(`update-not-available: version distante=${info && info.version}`);
  notifyUpdateStatus('up-to-date', 'Widget à jour');
});
autoUpdater.on('download-progress', (progress) => {
  notifyUpdateStatus('downloading', `Téléchargement… ${Math.round(progress.percent)}%`);
});
autoUpdater.on('update-downloaded', (info) => {
  logUpdate(`update-downloaded: version=${info.version}`);
  notifyUpdateStatus('ready', `Mise à jour ${info.version} prête`);
});
autoUpdater.on('error', (err) => {
  logUpdate(`ERREUR: ${err && err.message ? err.message : err}`);
  notifyUpdateStatus('error', 'Erreur de mise à jour');
});

// Redémarre l'application pour installer la mise à jour téléchargée.
// Important : on autorise ici la fermeture réelle (isQuitting = true), sinon notre
// gestionnaire de fermeture (qui cache normalement le widget dans le tray au lieu
// de fermer) empêcherait l'application de se fermer complètement avant l'installation.
ipcMain.on('install-update', () => {
  isQuitting = true;
  autoUpdater.quitAndInstall();
});

// Ramène la fenêtre principale au premier plan (utilisé quand une alarme sonne),
// même si elle est minimisée ou cachée derrière d'autres fenêtres
ipcMain.on('bring-to-front', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.flashFrame(true); // fait clignoter l'icône dans la barre des tâches
});
ipcMain.on('stop-flash', () => {
  if (win && !win.isDestroyed()) win.flashFrame(false);
});

// L'application reste active dans le tray même si la fenêtre principale est cachée ;
// elle ne se quitte que via "Quitter" dans le menu du tray (voir createTray).
app.on('window-all-closed', () => {
  if (isQuitting) app.quit();
});

// Boutons de la fenêtre (fermer / réduire) pilotés depuis index.html.
// "Fermer" (×) cache simplement le widget dans le tray, ça ne quitte pas l'application.
ipcMain.on('close-app', () => { if (win) win.hide(); });
ipcMain.on('minimize-app', () => win.minimize());

// Ouverture / fermeture de la fenêtre réglages (indépendante)
ipcMain.on('open-settings', () => createSettingsWindow());
ipcMain.on('close-settings', () => { if (settingsWin) settingsWin.close(); });

// Numéro de version actuel du widget (affiché dans les réglages)
ipcMain.handle('get-app-version', () => app.getVersion());

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

// Verrouille/déverrouille le déplacement et le redimensionnement de la fenêtre principale.
// Verrouillée = toujours visible au-dessus des autres fenêtres.
// Déverrouillée = se comporte comme une fenêtre normale, peut passer derrière d'autres apps.
ipcMain.on('set-locked', (event, locked) => {
  win.setMovable(!locked);
  win.setResizable(!locked);
  win.setAlwaysOnTop(locked);
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