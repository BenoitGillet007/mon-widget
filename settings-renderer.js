const { ipcRenderer } = require('electron');

/* ---------- Fermeture de la fenêtre ---------- */
// Ferme directement CETTE fenêtre (pas besoin de repasser par le processus principal)
document.getElementById('btnCloseSettings').onclick = () => window.close();

/* ---------- Numéro de version du widget ---------- */
ipcRenderer.invoke('get-app-version').then((version) => {
  document.getElementById('versionLabel').textContent = `Version ${version}`;
});

/* ---------- Récupération de l'état actuel depuis la fenêtre principale ---------- */
// Les deux fenêtres ne partagent pas leur stockage local : on demande donc à la
// fenêtre principale de nous envoyer ses valeurs actuelles pour préremplir les champs.
const cityInput = document.getElementById('cityInput');
const opacityRange = document.getElementById('opacityRange');
const accentInput = document.getElementById('accentColor');
const bgInput = document.getElementById('bgColor');

function hexToRgbTriplet(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function applyLocalColors(accent, bg) {
  // Prévisualise aussi les couleurs choisies sur cette fenêtre réglages elle-même
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--bg-color', hexToRgbTriplet(bg));
}

ipcRenderer.on('current-settings-response', (event, state) => {
  cityInput.value = state.city;
  opacityRange.value = state.opacity;
  accentInput.value = state.accentColor;
  bgInput.value = state.bgColor;
  applyLocalColors(state.accentColor, state.bgColor);

  document.getElementById('checkClock').checked = state.visibility.clock;
  document.getElementById('checkDate').checked = state.visibility.date;
  document.getElementById('checkWeather').checked = state.visibility.weather;
  document.getElementById('checkNotes').checked = state.visibility.notes;
  document.getElementById('checkCalendar').checked = state.visibility.calendar;
  document.getElementById('checkAlarm').checked = state.visibility.alarm;
});

// Demande l'état actuel dès l'ouverture de la fenêtre
ipcRenderer.send('request-current-settings');

/* ---------- Ville pour la météo ---------- */
document.getElementById('saveCity').onclick = () => {
  const val = cityInput.value.trim();
  if (val) ipcRenderer.send('settings-update', { type: 'city', value: val });
};

/* ---------- Opacité de la fenêtre principale ---------- */
opacityRange.oninput = (e) => {
  const val = parseFloat(e.target.value);
  ipcRenderer.send('set-opacity', val);                              // applique tout de suite
  ipcRenderer.send('settings-update', { type: 'opacity', value: val }); // mémorise
};

/* ---------- Démarrage automatique avec Windows ---------- */
const startupCheckbox = document.getElementById('checkStartup');

ipcRenderer.invoke('get-startup').then((isEnabled) => {
  startupCheckbox.checked = isEnabled;
});

startupCheckbox.addEventListener('change', () => {
  ipcRenderer.send('set-startup', startupCheckbox.checked);
});

/* ---------- Couleurs ---------- */
accentInput.addEventListener('input', () => {
  applyLocalColors(accentInput.value, bgInput.value);
  ipcRenderer.send('settings-update', { type: 'accentColor', value: accentInput.value });
});
bgInput.addEventListener('input', () => {
  applyLocalColors(accentInput.value, bgInput.value);
  ipcRenderer.send('settings-update', { type: 'bgColor', value: bgInput.value });
});

document.getElementById('resetColors').onclick = () => {
  const defaultAccent = '#6c8cff';
  const defaultBg = '#191c26';
  accentInput.value = defaultAccent;
  bgInput.value = defaultBg;
  applyLocalColors(defaultAccent, defaultBg);
  ipcRenderer.send('settings-update', { type: 'accentColor', value: defaultAccent });
  ipcRenderer.send('settings-update', { type: 'bgColor', value: defaultBg });
};

/* ---------- Sections affichées ---------- */
function sendVisibility() {
  const v = {
    clock: document.getElementById('checkClock').checked,
    date: document.getElementById('checkDate').checked,
    weather: document.getElementById('checkWeather').checked,
    notes: document.getElementById('checkNotes').checked,
    calendar: document.getElementById('checkCalendar').checked,
    alarm: document.getElementById('checkAlarm').checked,
  };
  ipcRenderer.send('settings-update', { type: 'visibility', value: v });
}

['checkClock', 'checkDate', 'checkWeather', 'checkNotes', 'checkCalendar', 'checkAlarm'].forEach(id => {
  document.getElementById(id).addEventListener('change', sendVisibility);
});
