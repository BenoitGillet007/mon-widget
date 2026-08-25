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
const defaultVisibility = { clock: true, date: true, weather: true, notes: true, calendar: true, alarm: true };

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
  const alarmTabBtn = document.querySelector('.tab-btn[data-tab="alarm"]');
  notesTabBtn.style.display = v.notes ? '' : 'none';
  calendarTabBtn.style.display = v.calendar ? '' : 'none';
  alarmTabBtn.style.display = v.alarm ? '' : 'none';

  const tabsBar = document.querySelector('.tabs');
  tabsBar.style.display = (v.notes || v.calendar || v.alarm) ? '' : 'none';

  const activeBtn = document.querySelector('.tab-btn.active');
  const activeBtnIsHidden = activeBtn && activeBtn.style.display === 'none';
  const noTabActiveAtAll = !activeBtn; // arrive si tout avait été décoché puis on recoche

  if (activeBtnIsHidden || noTabActiveAtAll) {
    const fallback = v.notes ? notesTabBtn : (v.calendar ? calendarTabBtn : (v.alarm ? alarmTabBtn : null));
    // On bascule directement les classes "active" plutôt que de simuler un clic :
    // à ce stade du script, les gestionnaires de clic sur les onglets ne sont pas
    // encore attachés (ils le sont plus loin dans le fichier), donc .click() ne
    // ferait rien lors de ce tout premier appel au chargement du widget.
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    if (fallback) {
      fallback.classList.add('active');
      document.getElementById('tab-' + fallback.dataset.tab).classList.add('active');
    }
  }
}

applyVisibility();
measureAndResize();

/* ---------- Horloge & Date ---------- */
// Ces variables/fonctions doivent être déclarées AVANT updateClock() car checkAlarms()
// (appelée dès le premier tic de l'horloge) peut déclencher une alarme dès le tout
// premier instant si une alarme est encore due au moment où le widget s'ouvre.
let lastCheckedMinute = null;
let alarmBeepInterval = null;
let currentRingingSound = 'classic';

// Catalogue des sonneries. Chaque son est généré à la volée (Web Audio API),
// pas de fichier audio à gérer. "interval" = délai en ms entre deux répétitions.
const ALARM_SOUNDS = {
  classic: { label: '🔔 Classique', icon: '🔔', interval: 800, play: () => playTone(880, 0, 0.3) },
  soft: {
    label: '🎐 Douce', icon: '🎐', interval: 1200,
    play: () => { playTone(523.25, 0, 0.5, 'sine', 0.15); playTone(659.25, 0.15, 0.5, 'sine', 0.15); },
  },
  urgent: {
    label: '🚨 Urgente', icon: '🚨', interval: 500,
    play: () => { playTone(1000, 0, 0.12, 'square', 0.2); playTone(1000, 0.18, 0.12, 'square', 0.2); },
  },
  siren: { label: '🚔 Sirène', icon: '🚔', interval: 1600, play: () => playSirenSweep() },
  bell: { label: '🛎️ Cloche', icon: '🛎️', interval: 1400, play: () => playBellChime() },
};

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, startDelay, duration, type = 'sine', gainValue = 0.25) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const startTime = ctx.currentTime + startDelay;
  gain.gain.setValueAtTime(gainValue, startTime);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playSirenSweep() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.2, now);
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.linearRampToValueAtTime(1000, now + 0.6);
  osc.frequency.linearRampToValueAtTime(400, now + 1.2);
  osc.start(now);
  osc.stop(now + 1.2);
}

function playBellChime() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  [880, 1320, 1760].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15 / (i + 1), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    osc.start(now);
    osc.stop(now + 1.0);
  });
}

function playAlarmSound(soundId) {
  try {
    const sound = ALARM_SOUNDS[soundId] || ALARM_SOUNDS.classic;
    sound.play();
  } catch (err) {
    // pas grave si le son échoue, l'écran de sonnerie reste visible
  }
}

// Empêche aussi qu'une alarme encore due au tout premier instant ne fasse planter le
// script avant que les boutons Arrêter/+5 min n'aient pu être connectés (voir plus bas) :
// ringAlarm/stopRinging sont déclarées en "function" donc hissées, mais elles utilisent
// les éléments du DOM (déjà présents) et les constantes ci-dessus (déjà initialisées ici).
function ringAlarm(alarm) {
  document.getElementById('alarmRingText').textContent = alarm.label || `Réveil de ${alarm.time}`;
  document.getElementById('alarmRingOverlay').classList.add('active');

  currentRingingSound = alarm.sound || 'classic';
  const sound = ALARM_SOUNDS[currentRingingSound] || ALARM_SOUNDS.classic;
  sound.play();
  clearInterval(alarmBeepInterval);
  alarmBeepInterval = setInterval(() => sound.play(), sound.interval);

  ipcRenderer.send('bring-to-front'); // ramène la fenêtre au premier plan même minimisée
}

function stopRinging() {
  clearInterval(alarmBeepInterval);
  document.getElementById('alarmRingOverlay').classList.remove('active');
  ipcRenderer.send('stop-flash');
}

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('fr-FR');
  document.getElementById('date').textContent = now.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  checkAlarms(now);
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
    measureAndResize(); // l'onglet Alarme n'a pas une hauteur fixe, contrairement aux autres
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

/* ---------- Alarmes ---------- */
// (Le catalogue de sons ALARM_SOUNDS, ringAlarm et stopRinging sont déclarés plus haut,
// avant updateClock, pour éviter tout plantage si une alarme est due dès l'ouverture.)

document.getElementById('previewSoundBtn').onclick = () => {
  playAlarmSound(document.getElementById('alarmSoundInput').value);
};

function loadAlarms() {
  try {
    return JSON.parse(localStorage.getItem('alarms')) || [];
  } catch (err) {
    return [];
  }
}

function saveAlarms(list) {
  localStorage.setItem('alarms', JSON.stringify(list));
}

function renderAlarmList() {
  const list = loadAlarms();
  const container = document.getElementById('alarmList');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<div class="alarm-empty">Aucune alarme</div>';
  } else {
    [...list].sort((a, b) => a.time.localeCompare(b.time)).forEach((alarm) => {
      const icon = (ALARM_SOUNDS[alarm.sound] || ALARM_SOUNDS.classic).icon;
      const row = document.createElement('div');
      row.className = 'alarm-item';
      row.innerHTML = `
        <input type="checkbox" class="alarm-enable" data-id="${alarm.id}" ${alarm.enabled ? 'checked' : ''} />
        <div class="alarm-info">
          <div class="alarm-time">${icon} ${alarm.time}</div>
          <div class="alarm-label">${alarm.label || ''}</div>
        </div>
        <button class="alarm-delete" data-id="${alarm.id}">×</button>
      `;
      container.appendChild(row);
    });
  }

  // La zone alarme grandit avec la liste (contrairement à Notes/Calendrier) :
  // on redemande donc la taille à chaque fois que la liste change.
  measureAndResize();
}
renderAlarmList();

document.getElementById('addAlarmBtn').onclick = () => {
  const timeInput = document.getElementById('alarmTimeInput');
  const labelInput = document.getElementById('alarmLabelInput');
  const soundInput = document.getElementById('alarmSoundInput');
  if (!timeInput.value) return;

  const list = loadAlarms();
  list.push({
    id: Date.now().toString(),
    time: timeInput.value,       // format "HH:MM"
    label: labelInput.value.trim(),
    sound: soundInput.value,
    enabled: true,
  });
  saveAlarms(list);
  timeInput.value = '';
  labelInput.value = '';
  renderAlarmList();
};

document.getElementById('alarmList').addEventListener('change', (e) => {
  if (!e.target.classList.contains('alarm-enable')) return;
  const list = loadAlarms();
  const alarm = list.find((a) => a.id === e.target.dataset.id);
  if (alarm) {
    alarm.enabled = e.target.checked;
    saveAlarms(list);
  }
});

document.getElementById('alarmList').addEventListener('click', (e) => {
  if (!e.target.classList.contains('alarm-delete')) return;
  const list = loadAlarms().filter((a) => a.id !== e.target.dataset.id);
  saveAlarms(list);
  renderAlarmList();
});

/* ---------- Déclenchement des alarmes ---------- */
// (lastCheckedMinute, alarmBeepInterval, ringAlarm et stopRinging sont déclarées
// plus haut, avant updateClock)

function checkAlarms(now) {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentMinute = `${hh}:${mm}`;

  if (currentMinute === lastCheckedMinute) return; // déjà vérifié cette minute-ci
  lastCheckedMinute = currentMinute;

  loadAlarms().forEach((alarm) => {
    if (alarm.enabled && alarm.time === currentMinute) {
      ringAlarm(alarm);
    }
  });
}

document.getElementById('alarmStopBtn').onclick = stopRinging;

document.getElementById('alarmSnoozeBtn').onclick = () => {
  const label = document.getElementById('alarmRingText').textContent;
  const soundId = currentRingingSound;
  stopRinging();
  setTimeout(() => {
    ringAlarm({ label: `${label} (répétée)`, sound: soundId });
  }, 5 * 60 * 1000);
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