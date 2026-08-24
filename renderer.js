const { ipcRenderer } = require('electron');

/* ---------- Adaptation automatique de la hauteur de la fenêtre principale ---------- */
// Mesure la hauteur réellement occupée par le contenu visible et demande
// au processus principal (main.js) de redimensionner CETTE fenêtre en conséquence.
// (La fenêtre réglages, elle, a sa propre taille fixe et n'est jamais concernée.)
function measureAndResize() {
  requestAnimationFrame(() => {
    const widget = document.querySelector('.widget');
    const targetHeight = widget.scrollHeight;
    ipcRenderer.send('resize-window', { height: targetHeight });
  });
}

/* ---------- Boutons fenêtre ---------- */
document.getElementById('btnClose').onclick = () => ipcRenderer.send('close-app');
document.getElementById('btnMinimize').onclick = () => ipcRenderer.send('minimize-app');
document.getElementById('btnSettings').onclick = () => ipcRenderer.send('open-settings');

/* ---------- Verrouillage de la position ---------- */
const btnLock = document.getElementById('btnLock');
const dragRegion = document.getElementById('dragRegion');

function applyLockState(locked) {
  ipcRenderer.send('set-locked', locked);
  btnLock.textContent = locked ? '🔒' : '🔓';
  btnLock.title = locked ? 'Débloquer la position' : 'Figer la position';
  btnLock.classList.toggle('active', locked);
  dragRegion.style.webkitAppRegion = locked ? 'no-drag' : 'drag';
  localStorage.setItem('locked', locked ? '1' : '0');
}

btnLock.onclick = () => {
  const currentlyLocked = localStorage.getItem('locked') === '1';
  applyLockState(!currentlyLocked);
};

applyLockState(localStorage.getItem('locked') === '1');

/* ---------- Affichage des sections (heure, date, météo, notes, calendrier) ---------- */
// Les cases à cocher correspondantes vivent maintenant dans la fenêtre réglages (settings.html).
// Cette fenêtre-ci lit juste la valeur sauvegardée et l'applique à l'affichage.
const defaultVisibility = { clock: true, date: true, weather: true, notes: true, calendar: true };

function loadVisibility() {
  try {
    return { ...defaultVisibility, ...JSON.parse(localStorage.getItem('visibility')) };
  } catch (err) {
    return { ...defaultVisibility };
  }
}

function applyVisibility() {
  const v = loadVisibility();

  document.getElementById('clock').style.display = v.clock ? '' : 'none';
  document.getElementById('date').style.display = v.date ? '' : 'none';
  document.querySelector('.clock-section').style.display = (v.clock || v.date) ? '' : 'none';

  document.getElementById('weatherBox').style.display = v.weather ? '' : 'none';

  const notesTabBtn = document.querySelector('.tab-btn[data-tab="notes"]');
  const calendarTabBtn = document.querySelector('.tab-btn[data-tab="calendar"]');
  notesTabBtn.style.display = v.notes ? '' : 'none';
  calendarTabBtn.style.display = v.calendar ? '' : 'none';

  const tabsBar = document.querySelector('.tabs');
  tabsBar.style.display = (v.notes || v.calendar) ? '' : 'none';

  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn && activeBtn.style.display === 'none') {
    const fallback = v.notes ? notesTabBtn : (v.calendar ? calendarTabBtn : null);
    if (fallback) fallback.click();
    else document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  }
}

applyVisibility();
measureAndResize();

/* ---------- Horloge & Date ---------- */
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('fr-FR');
  document.getElementById('date').textContent = now.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}
updateClock();
setInterval(updateClock, 1000);

/* ---------- Météo (API gratuite Open-Meteo, sans clé) ---------- */
const weatherBox = document.getElementById('weatherBox');
const weatherCodes = {
  0: '☀️ Ciel dégagé', 1: '🌤️ Plutôt clair', 2: '⛅ Partiellement nuageux', 3: '☁️ Couvert',
  45: '🌫️ Brouillard', 48: '🌫️ Brouillard givrant',
  51: '🌦️ Bruine légère', 53: '🌦️ Bruine', 55: '🌧️ Bruine forte',
  61: '🌧️ Pluie légère', 63: '🌧️ Pluie', 65: '🌧️ Forte pluie',
  71: '🌨️ Neige légère', 73: '🌨️ Neige', 75: '❄️ Forte neige',
  80: '🌦️ Averses', 81: '🌧️ Averses fortes', 82: '⛈️ Averses violentes',
  95: '⛈️ Orage', 96: '⛈️ Orage + grêle', 99: '⛈️ Orage violent'
};

async function loadWeather() {
  const city = localStorage.getItem('city') || 'Lierneux, Belgique';
  weatherBox.innerHTML = '<div class="weather-loading">Chargement météo…</div>';
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`);
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) {
      weatherBox.innerHTML = '<div class="weather-loading">Ville introuvable. Change-la dans les réglages ⚙</div>';
      measureAndResize();
      return;
    }
    const { latitude, longitude, name, country } = geoData.results[0];

    const meteoRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
    const meteoData = await meteoRes.json();
    const cw = meteoData.current_weather;
    const desc = weatherCodes[cw.weathercode] || '🌡️ Météo';
    const [icon, ...rest] = desc.split(' ');

    weatherBox.innerHTML = `
      <div>
        <div class="weather-temp">${Math.round(cw.temperature)}°C</div>
        <div class="weather-city">${name}, ${country}</div>
      </div>
      <div style="text-align:right">
        <div class="weather-icon">${icon}</div>
        <div class="weather-city">${rest.join(' ')}</div>
      </div>
    `;
  } catch (err) {
    weatherBox.innerHTML = '<div class="weather-loading">Erreur de connexion météo</div>';
  }
  measureAndResize();
}
loadWeather();
setInterval(loadWeather, 15 * 60 * 1000); // rafraîchit toutes les 15 minutes

/* ---------- Onglets ---------- */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  };
});

/* ---------- Notes (sauvegardées automatiquement) ---------- */
const notesArea = document.getElementById('notesArea');
notesArea.value = localStorage.getItem('notes') || '';
notesArea.addEventListener('input', () => {
  localStorage.setItem('notes', notesArea.value);
});

/* ---------- Calendrier ---------- */
let calDate = new Date();
const calendarGrid = document.getElementById('calendarGrid');
const calendarTitle = document.getElementById('calendarTitle');
const dayNames = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function renderCalendar() {
  calendarGrid.innerHTML = '';
  dayNames.forEach(d => {
    const el = document.createElement('div');
    el.className = 'day-name';
    el.textContent = d;
    calendarGrid.appendChild(el);
  });

  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  calendarTitle.textContent = calDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1);
  let startIndex = firstDay.getDay() - 1;
  if (startIndex < 0) startIndex = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  for (let i = 0; i < startIndex; i++) {
    calendarGrid.appendChild(document.createElement('div'));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    cell.textContent = d;
    if (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
      cell.classList.add('today');
    }
    calendarGrid.appendChild(cell);
  }
}
renderCalendar();

document.getElementById('prevMonth').onclick = () => {
  calDate.setMonth(calDate.getMonth() - 1);
  renderCalendar();
};
document.getElementById('nextMonth').onclick = () => {
  calDate.setMonth(calDate.getMonth() + 1);
  renderCalendar();
};

/* ---------- Couleurs personnalisables ---------- */
function hexToRgbTriplet(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function applyColors() {
  const accent = localStorage.getItem('accentColor') || '#6c8cff';
  const bg = localStorage.getItem('bgColor') || '#191c26';
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--bg-color', hexToRgbTriplet(bg));
}
applyColors();

// Réapplique l'opacité sauvegardée au démarrage
const savedOpacity = parseFloat(localStorage.getItem('opacity'));
if (!isNaN(savedOpacity)) {
  ipcRenderer.send('set-opacity', savedOpacity);
}

/* ---------- Statut des mises à jour automatiques ---------- */
const updateBanner = document.getElementById('updateBanner');
const updateMessage = document.getElementById('updateMessage');
const updateRestartBtn = document.getElementById('updateRestartBtn');

function showUpdateBanner(text, showRestart = false) {
  updateMessage.textContent = text;
  updateRestartBtn.style.display = showRestart ? 'inline-block' : 'none';
  updateBanner.classList.add('visible');
  measureAndResize();
}

function hideUpdateBanner() {
  updateBanner.classList.remove('visible');
  measureAndResize();
}

ipcRenderer.on('update-status', (event, { status, message }) => {
  switch (status) {
    case 'checking':
    case 'available':
    case 'downloading':
      showUpdateBanner(message);
      break;
    case 'ready':
      showUpdateBanner(message, true); // affiche le bouton "Redémarrer"
      break;
    case 'up-to-date':
      showUpdateBanner(message);
      setTimeout(hideUpdateBanner, 4000); // disparaît tout seul après 4s
      break;
    case 'error':
      showUpdateBanner(message);
      setTimeout(hideUpdateBanner, 5000);
      break;
  }
});

updateRestartBtn.onclick = () => ipcRenderer.send('install-update');

/* ---------- Synchronisation avec la fenêtre réglages ---------- */
// La fenêtre réglages envoie ses changements via IPC (relayés par main.js) :
// on les applique ici dès qu'ils arrivent, et on les mémorise dans NOTRE stockage local.
ipcRenderer.on('settings-update', (event, payload) => {
  switch (payload.type) {
    case 'visibility':
      localStorage.setItem('visibility', JSON.stringify(payload.value));
      applyVisibility();
      measureAndResize();
      break;
    case 'city':
      localStorage.setItem('city', payload.value);
      loadWeather();
      break;
    case 'accentColor':
      localStorage.setItem('accentColor', payload.value);
      applyColors();
      break;
    case 'bgColor':
      localStorage.setItem('bgColor', payload.value);
      applyColors();
      break;
    case 'opacity':
      localStorage.setItem('opacity', payload.value);
      break;
  }
});

// Quand la fenêtre réglages s'ouvre, elle nous demande l'état actuel pour préremplir
// correctement ses champs (ville, couleurs, sections affichées, opacité)
ipcRenderer.on('send-current-settings', () => {
  ipcRenderer.send('current-settings-response', {
    visibility: loadVisibility(),
    city: localStorage.getItem('city') || 'Lierneux, Belgique',
    accentColor: localStorage.getItem('accentColor') || '#6c8cff',
    bgColor: localStorage.getItem('bgColor') || '#191c26',
    opacity: localStorage.getItem('opacity') || '1',
  });
});