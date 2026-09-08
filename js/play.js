import { db, ref, set, update, onValue } from "./firebase-config.js";
import { showNotification } from "./modal.js";

const ICONS = ['⚽', '🧤', '🏆', '🔥', '👑', '⚡'];
let chosenAvatar = ICONS[0];
let homeScore = 0;
let awayScore = 0;
let myPlayerId = 'p_' + Date.now() + Math.random().toString(36).substring(2, 6);
let currentRound = 1;

// Lee el parámetro de la URL si entra por QR (?room=CODIGO)
const urlParams = new URLSearchParams(window.location.search);
let currentRoom = (urlParams.get('room') || 'SALA-1').toUpperCase();

// Asigna el valor al input visual del lobby
const roomInput = document.getElementById('player-room');
if (roomInput) {
  roomInput.value = currentRoom;
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
  
  document.getElementById('current-avatar').textContent = chosenAvatar;
  document.getElementById('current-name').textContent = nick;

  set(ref(db, `rooms/${currentRoom}/players/${myPlayerId}`), {
    id: myPlayerId,
    name: nick,
    avatar: chosenAvatar,
    score: 0,
    submitted: false,
    lastAnswer: null
  });

  onValue(ref(db, `rooms/${currentRoom}`), async (snapshot) => {
    const roomData = snapshot.val();

    // Si el host eliminó la sala
    if (!roomData) {
      await showNotification({
        title: 'Sala cerrada',
        message: 'La sala de juego fue cerrada por el host.',
        icon: '🔒'
      });
      window.location.reload();
      return;
    }

    // Si fue kickeado
    if (!roomData.players || !roomData.players[myPlayerId]) {
      await showNotification({
        title: 'Expulsado',
        message: 'Has sido expulsado de la partida.',
        icon: '🚪'
      });
      window.location.reload();
      return;
    }

    if (roomData.round && roomData.round !== currentRound) {
      currentRound = roomData.round;
      document.getElementById('round-badge').textContent = `Ronda ${currentRound}`;
      resetMobileForm();
    }
  });

  document.getElementById('lobby-view').style.display = 'none';
  document.getElementById('game-view').style.display = 'flex';
});

function resetMobileForm() {
  document.getElementById('answer-scorer').value = '';
  homeScore = 0;
  awayScore = 0;
  document.getElementById('val-home').textContent = '0';
  document.getElementById('val-away').textContent = '0';
  document.getElementById('submitted-overlay').style.display = 'none';
  document.getElementById('form-container').style.display = 'block';
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