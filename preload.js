// Ce script s'exécute dans un contexte à part (isolé du code de la page), avec un accès
// privilégié à Electron/Node.js. Il n'expose à la page QUE les fonctions listées ci-dessous,
// via window.api. Contrairement à nodeIntegration+contextIsolation désactivés (l'ancienne
// configuration), la page elle-même n'a plus aucun accès direct à Node.js, à require(),
// ni à ipcRenderer brut : elle ne peut appeler que ce qui est explicitement autorisé ici.
// Résultat : même si du code malveillant s'exécutait dans la page (ex: via une faille XSS),
// il ne pourrait pas exécuter de commandes système ou lire/écrire des fichiers arbitraires.

const { contextBridge, ipcRenderer } = require('electron');

// Canaux que la page a le droit d'ENVOYER vers le processus principal
const validSendChannels = [
  'resize-window',
  'close-app',
  'minimize-app',
  'open-settings',
  'close-settings',
  'set-locked',
  'set-opacity',
  'bring-to-front',
  'stop-flash',
  'install-update',
  'settings-update',
  'request-current-settings',
  'current-settings-response',
  'set-startup',
];

// Canaux que la page a le droit d'appeler en mode "invoke" (avec réponse attendue)
const validInvokeChannels = ['get-app-version', 'get-startup'];

// Canaux que la page a le droit d'ÉCOUTER depuis le processus principal
const validReceiveChannels = [
  'update-status',
  'settings-update',
  'send-current-settings',
  'current-settings-response',
];

contextBridge.exposeInMainWorld('api', {
  send: (channel, ...args) => {
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      console.error('Canal IPC non autorisé (send):', channel);
    }
  },
  invoke: (channel, ...args) => {
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    console.error('Canal IPC non autorisé (invoke):', channel);
    return Promise.reject(new Error('Canal non autorisé: ' + channel));
  },
  on: (channel, callback) => {
    if (validReceiveChannels.includes(channel)) {
      const listener = (event, ...args) => callback(...args);
      ipcRenderer.on(channel, listener);
    } else {
      console.error('Canal IPC non autorisé (on):', channel);
    }
  },
});
