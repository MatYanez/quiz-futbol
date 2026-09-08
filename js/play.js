import { db, ref, set, update, onValue } from "./firebase-config.js";
import { showNotification } from "./modal.js";

const ICONS = ['⚽', '🧤', '🏆', '🔥', '👑', '⚡'];
let chosenAvatar = localStorage.getItem('ga_avatar') || ICONS[0];
let homeScore = 0;
let awayScore = 0;
let currentRound = 1;

// Recuperar ID persistente en localStorage para que sobreviva cierres de pestaña
let myPlayerId = localStorage.getItem('ga_pid');
if (!myPlayerId) {
  myPlayerId = 'p_' + Date.now() + Math.random().toString(36).substring(2, 6);
  localStorage.setItem('ga_pid', myPlayerId);
}

// Lee el parámetro de la URL si entra por QR (?room=CODIGO)
const urlParams = new URLSearchParams(window.location.search);
let currentRoom = (urlParams.get('room') || localStorage.getItem('ga_room') || 'SALA-1').toUpperCase();

// Asigna el valor al input visual del lobby
const roomInput = document.getElementById('player-room');
if (roomInput) {
  roomInput.value = currentRoom;
}

const savedNick = localStorage.getItem('ga_nick');
if (savedNick) {
  const nickInput = document.getElementById('player-nickname');
  if (nickInput) nickInput.value = savedNick;
}

const DB_PLAYERS = [
  { name: 'Esteban Paredes', country: 'Chile', team: 'Colo-Colo' },
  { name: 'Humberto Suazo', country: 'Chile', team: 'Colo-Colo' },
  { name: 'Marcelo Salas', country: 'Chile', team: 'U. de Chile' },
  { name: 'Eduardo Vargas', country: 'Chile', team: 'U. de Chile' },
  { name: 'Carlos Caszely', country: 'Chile', team: 'Colo-Colo' },
  { name: 'Arturo Vidal', country: 'Chile', team: 'Colo-Colo' },
  { name: 'Alexis Sánchez', country: 'Chile', team: 'Colo-Colo' },
  { name: 'Diego Rivarola', country: 'Argentina', team: 'U. de Chile' },
  { name: 'Lucas Barrios', country: 'Paraguay', team: 'Colo-Colo' },
  { name: 'Walter Montillo', country: 'Argentina', team: 'U. de Chile' },
  { name: 'Matías Fernández', country: 'Chile', team: 'Colo-Colo' },
  { name: 'Charles Aránguiz', country: 'Chile', team: 'U. de Chile' },
  { name: 'Lionel Messi', country: 'Argentina', team: 'Barcelona' },
  { name: 'Cristiano Ronaldo', country: 'Portugal', team: 'Real Madrid' },
  { name: 'Zinedine Zidane', country: 'Francia', team: 'Real Madrid' },
  { name: 'Ronaldinho', country: 'Brasil', team: 'Barcelona' }
];

// Avatares
const avatarGrid = document.getElementById('mobile-avatars');
avatarGrid.innerHTML = ICONS.map(i => `
  <div class="avatar-card ${i === chosenAvatar ? 'active' : ''}" data-icon="${i}">${i}</div>
`).join('');

avatarGrid.querySelectorAll('.avatar-card').forEach(card => {
  card.addEventListener('click', () => {
    chosenAvatar = card.dataset.icon;
    avatarGrid.querySelectorAll('.avatar-card').forEach(el => el.classList.toggle('active', el.dataset.icon === chosenAvatar));
  });
});

// Entrar a sala
// Entrar a sala y sincronizar
async function joinRoomSession(nick, room, isAutoReconnect = false) {
  document.getElementById('current-avatar').textContent = chosenAvatar;
  document.getElementById('current-name').textContent = nick;

  // Si no es reconexión automática, registramos al jugador en Firebase
  if (!isAutoReconnect) {
    set(ref(db, `rooms/${room}/players/${myPlayerId}`), {
      id: myPlayerId,
      name: nick,
      avatar: chosenAvatar,
      score: 0,
      submitted: false,
      lastAnswer: null
    });
  }

  // Guardar datos en localStorage para auto-reconectar si actualiza
  localStorage.setItem('ga_joined', 'true');
  localStorage.setItem('ga_nick', nick);
  localStorage.setItem('ga_room', room);
  localStorage.setItem('ga_avatar', chosenAvatar);

  // Escuchar estado de la sala
  onValue(ref(db, `rooms/${room}`), async (snapshot) => {
    const roomData = snapshot.val();

    // Si la sala fue eliminada por el host
    if (!roomData) {
      localStorage.removeItem('ga_joined');
      await showNotification({
        title: 'Sala cerrada',
        message: 'La sala de juego fue cerrada por el host.',
        icon: '🔒'
      });
      window.location.reload();
      return;
    }

    // Si fue expulsado por el host
    if (!roomData.players || !roomData.players[myPlayerId]) {
      localStorage.removeItem('ga_joined');
      await showNotification({
        title: 'Expulsado',
        message: 'Has sido expulsado de la partida.',
        icon: '🚪'
      });
      window.location.reload();
      return;
    }

// Sincronizar ronda actual
    if (roomData.round) {
      const isNewRound = roomData.round !== currentRound;
      currentRound = roomData.round;
      document.getElementById('round-badge').textContent = `Ronda ${currentRound}`;
      
      if (isNewRound) {
        resetMobileForm();
      }
    }

    // Restaurar si el jugador ya había respondido antes de recargar
    const me = roomData.players && roomData.players[myPlayerId];
    if (me && me.submitted) {
      document.getElementById('form-container').style.display = 'none';
      document.getElementById('submitted-overlay').style.display = 'flex';
    }

    // Bloqueo estricto cuando el host abre la asignación de puntos
    const editBtn = document.getElementById('edit-answer-btn');
    const overlay = document.getElementById('submitted-overlay');
    if (roomData.pointsAssigning) {
      if (editBtn) editBtn.style.display = 'none';
      if (!document.getElementById('lock-notice') && overlay) {
        const notice = document.createElement('div');
        notice.id = 'lock-notice';
        notice.style.cssText = 'font-size: 12px; color: var(--gold); border: 1px dashed var(--gold); border-radius: 8px; padding: 8px 12px; margin-top: 10px; font-family: "Oswald"; text-transform: uppercase; letter-spacing: 0.5px;';
        notice.textContent = '🔒 Respuestas cerradas: Evaluando puntos';
        overlay.appendChild(notice);
      }
    } else {
      if (editBtn) editBtn.style.display = 'inline-block';
      const notice = document.getElementById('lock-notice');
      if (notice) notice.remove();
    }
  });

  document.getElementById('lobby-view').style.display = 'none';
  document.getElementById('game-view').style.display = 'flex';
}

// Botón "Entrar a la sala"
document.getElementById('join-btn').addEventListener('click', async () => {
  const nick = document.getElementById('player-nickname').value.trim();
  currentRoom = document.getElementById('player-room').value.trim().toUpperCase() || 'SALA-1';
  if (!nick) {
    return showNotification({
      title: 'Falta tu apodo',
      message: 'Por favor escribe un nombre o apodo para entrar a la cancha.',
      icon: '✍️'
    });
  }
  joinRoomSession(nick, currentRoom, false);
});

// Auto-reconexión si el usuario recarga la página
window.addEventListener('DOMContentLoaded', () => {
  const alreadyJoined = localStorage.getItem('ga_joined') === 'true';
  const savedNick = localStorage.getItem('ga_nick');
  const savedRoom = localStorage.getItem('ga_room');

  if (alreadyJoined && savedNick && savedRoom) {
    currentRoom = savedRoom;
    chosenAvatar = localStorage.getItem('ga_avatar') || chosenAvatar;
    joinRoomSession(savedNick, savedRoom, true);
  }
});

function resetMobileForm() {
  document.getElementById('answer-scorer').value = '';
  homeScore = 0;
  awayScore = 0;
  document.getElementById('val-home').textContent = '0';
  document.getElementById('val-away').textContent = '0';
  document.getElementById('submitted-overlay').style.display = 'none';
  document.getElementById('form-container').style.display = 'block';

  const editBtn = document.getElementById('edit-answer-btn');
  if (editBtn) {
    editBtn.style.display = 'inline-block';
    editBtn.disabled = false;
  }
  const lockNotice = document.getElementById('lock-notice');
  if (lockNotice) lockNotice.remove();
}

window.adjustScore = function(team, delta) {
  if (team === 'home') {
    homeScore = Math.max(0, homeScore + delta);
    document.getElementById('val-home').textContent = homeScore;
  } else {
    awayScore = Math.max(0, awayScore + delta);
    document.getElementById('val-away').textContent = awayScore;
  }
};

window.sendAnswer = async function() {
  const scorer = document.getElementById('answer-scorer').value.trim();
  if (!scorer) {
    return showNotification({
      title: 'Respuesta vacía',
      message: 'Debes indicar quién fue el jugador que anotó el gol.',
      icon: '⚽'
    });
  }

  update(ref(db, `rooms/${currentRoom}/players/${myPlayerId}`), {
    submitted: true,
    lastAnswer: { scorer, home: homeScore, away: awayScore }
  });

  document.getElementById('form-container').style.display = 'none';
  document.getElementById('submitted-overlay').style.display = 'flex';
};

window.editAnswer = function() {
  update(ref(db, `rooms/${currentRoom}/players/${myPlayerId}`), {
    submitted: false
  });
  document.getElementById('submitted-overlay').style.display = 'none';
  document.getElementById('form-container').style.display = 'block';
};

window.handleTypingScorer = function(val) {
  const query = val.trim().toLowerCase();
  const box = document.getElementById('suggestions-box');
  if (!query) { box.style.display = 'none'; return; }

  const filtered = DB_PLAYERS.filter(p => p.name.toLowerCase().includes(query));
  if (!filtered.length) { box.style.display = 'none'; return; }

  box.innerHTML = filtered.slice(0, 5).map(p => `
    <div class="sugg-item" onclick="selectPlayer('${p.name}')">
      <span>${p.name}</span>
      <span class="sugg-meta">${p.team} · ${p.country}</span>
    </div>
  `).join('');
  box.style.display = 'flex';
};

window.selectPlayer = function(name) {
  document.getElementById('answer-scorer').value = name;
  document.getElementById('suggestions-box').style.display = 'none';
  window.closeSearchModal();
};

// Modal de búsqueda
let uniqueCountries = [];
let uniqueTeams = [];

function initDropdownData() {
  uniqueCountries = ['Todos', ...new Set(DB_PLAYERS.map(p => p.country))].sort();
  uniqueTeams = ['Todos', ...new Set(DB_PLAYERS.map(p => p.team))].sort();
  renderDropdownItems('dropdown-countries', uniqueCountries, 'modal-filter-country');
  renderDropdownItems('dropdown-teams', uniqueTeams, 'modal-filter-team');
}

function renderDropdownItems(dropdownId, list, inputId) {
  const el = document.getElementById(dropdownId);
  el.innerHTML = list.map(item => `
    <div class="combo-opt" onclick="selectDropdownOption('${inputId}', '${dropdownId}', '${item}')">${item}</div>
  `).join('');
}

window.toggleDropdown = function(dropdownId) {
  const drop = document.getElementById(dropdownId);
  const wasOpen = drop.classList.contains('open');
  closeAllDropdowns();
  if (!wasOpen) drop.classList.add('open');
};

function closeAllDropdowns() {
  document.querySelectorAll('.combo-dropdown').forEach(d => d.classList.remove('open'));
}

window.onTypeDropdown = function(inputId, dropdownId) {
  const val = document.getElementById(inputId).value.trim().toLowerCase();
  const source = dropdownId === 'dropdown-countries' ? uniqueCountries : uniqueTeams;
  const filtered = source.filter(item => item.toLowerCase().includes(val));
  renderDropdownItems(dropdownId, filtered.length ? filtered : ['Sin coincidencias'], inputId);
  document.getElementById(dropdownId).classList.add('open');
  window.filterModalPlayers();
};

window.selectDropdownOption = function(inputId, dropdownId, value) {
  document.getElementById(inputId).value = value === 'Todos' || value === 'Sin coincidencias' ? '' : value;
  document.getElementById(dropdownId).classList.remove('open');
  window.filterModalPlayers();
};

window.openSearchModal = function() {
  initDropdownData();
  document.getElementById('search-modal').classList.add('open');
  window.filterModalPlayers();
};

window.closeSearchModal = function() {
  closeAllDropdowns();
  document.getElementById('search-modal').classList.remove('open');
};

window.filterModalPlayers = function() {
  const country = document.getElementById('modal-filter-country').value.trim().toLowerCase();
  const team = document.getElementById('modal-filter-team').value.trim().toLowerCase();
  const text = document.getElementById('modal-search-text').value.trim().toLowerCase();

  const results = DB_PLAYERS.filter(p => {
    const matchCountry = country ? p.country.toLowerCase().includes(country) : true;
    const matchTeam = team ? p.team.toLowerCase().includes(team) : true;
    const matchText = text ? p.name.toLowerCase().includes(text) : true;
    return matchCountry && matchTeam && matchText;
  });

  document.getElementById('results-count').textContent = results.length;
  const list = document.getElementById('modal-results-list');
  list.innerHTML = results.length ? results.map(p => `
    <div class="player-card-result" onclick="selectPlayer('${p.name}')">
      <strong>${p.name}</strong>
      <span class="sugg-meta">${p.team} (${p.country})</span>
    </div>
  `).join('') : '<p style="color: var(--text-muted); text-align:center; font-size: 13px; margin: 20px 0;">No se encontraron jugadores</p>';
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.combo-wrap')) closeAllDropdowns();
});