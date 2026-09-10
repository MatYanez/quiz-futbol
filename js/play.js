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

let DB_PLAYERS = [];
const DEFAULT_PLAYER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239FBBAA'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M12 14c-6.1 0-8 4-8 4v2h16v-2s-1.9-4-8-4z'/%3E%3C/svg%3E";

// Cargar la base de datos local desde data/players.json
async function loadPlayersDatabase() {
  try {
    const res = await fetch('data/players.json');
    DB_PLAYERS = await res.json();
    initDropdownData();
  } catch (err) {
    DB_PLAYERS = [];
  }
}
loadPlayersDatabase();

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

// Función para mezclar un arreglo aleatoriamente (Fisher-Yates)
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

window.selectPlayer = function(name) {
  const input = document.getElementById('answer-scorer');
  if (input) input.value = name;
  const box = document.getElementById('suggestions-box');
  if (box) box.style.display = 'none';
  const modal = document.getElementById('search-modal');
  if (modal) modal.classList.remove('open');
};

window.handleTypingScorer = function(val) {
  const query = (val || '').trim().toLowerCase();
  const box = document.getElementById('suggestions-box');
  if (!box) return;

  if (!query || query.length < 1) { 
    box.style.display = 'none';
    box.innerHTML = '';
    return; 
  }

  const matches = [];
  for (let i = 0; i < DB_PLAYERS.length; i++) {
    const p = DB_PLAYERS[i];
    if (p.name && p.name.toLowerCase().includes(query)) {
      matches.push(p);
      if (matches.length >= 30) break;
    }
  }

  if (!matches.length) { 
    box.style.display = 'none';
    box.innerHTML = '';
    return; 
  }

  const displayItems = shuffleArray(matches).slice(0, 5);

  box.innerHTML = '';
  displayItems.forEach(p => {
    const row = document.createElement('div');
    row.className = 'sugg-item';

    const img = document.createElement('img');
    img.className = 'sugg-avatar';
    img.referrerPolicy = 'no-referrer';
    img.src = p.photo || DEFAULT_PLAYER_IMG;
    img.onerror = () => { img.src = DEFAULT_PLAYER_IMG; };

    const details = document.createElement('div');
    details.className = 'sugg-details';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'sugg-name';
    nameSpan.textContent = p.name;

    const metaSpan = document.createElement('span');
    metaSpan.className = 'sugg-meta';
    metaSpan.textContent = `${p.team || 'Sin club'} · ${p.country || ''}`;

    details.appendChild(nameSpan);
    details.appendChild(metaSpan);

    row.appendChild(img);
    row.appendChild(details);

    row.onmousedown = (e) => {
      e.preventDefault();
      window.selectPlayer(p.name);
    };
    box.appendChild(row);
  });

  box.style.display = 'flex';
};

window.filterModalPlayers = function() {
  const country = document.getElementById('modal-filter-country').value.trim().toLowerCase();
  const team = document.getElementById('modal-filter-team').value.trim().toLowerCase();
  const text = document.getElementById('modal-search-text').value.trim().toLowerCase();

  const list = document.getElementById('modal-results-list');
  const countBadge = document.getElementById('results-count');

  if (!country && !team && text.length < 2) {
    countBadge.textContent = '0';
    list.innerHTML = '<p style="grid-column: span 2; color: var(--text-muted); text-align:center; font-size: 13px; margin: 20px 0;">Escribe al menos 2 letras o selecciona un filtro.</p>';
    return;
  }

  const MAX_POOL = 40;
  const matches = [];

  for (let i = 0; i < DB_PLAYERS.length; i++) {
    const p = DB_PLAYERS[i];
    const matchCountry = country ? (p.country && p.country.toLowerCase().includes(country)) : true;
    const matchTeam = team ? (p.team && p.team.toLowerCase().includes(team)) : true;
    const matchText = text ? (p.name && p.name.toLowerCase().includes(text)) : true;

    if (matchCountry && matchTeam && matchText) {
      matches.push(p);
      if (matches.length >= MAX_POOL) break;
    }
  }

  // 6 cards coleccionables aleatorias por tirada
  const displayResults = shuffleArray(matches).slice(0, 6);

  countBadge.textContent = matches.length >= MAX_POOL ? `${displayResults.length} de +${MAX_POOL}` : displayResults.length;
  list.innerHTML = '';

  if (!displayResults.length) {
    list.innerHTML = '<p style="grid-column: span 2; color: var(--text-muted); text-align:center; font-size: 13px; margin: 20px 0;">No se encontraron jugadores</p>';
    return;
  }

  displayResults.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-card-result';

    // Etiqueta superior del país
    if (p.country) {
      const badge = document.createElement('span');
      badge.className = 'player-card-badge';
      badge.textContent = p.country;
      card.appendChild(badge);
    }

    // Contenedor principal de la foto
    const imgWrap = document.createElement('div');
    imgWrap.className = 'player-card-img-wrap';

    const img = document.createElement('img');
    img.className = 'player-card-img';
    img.referrerPolicy = 'no-referrer';
    img.src = p.photo || DEFAULT_PLAYER_IMG;
    img.onerror = () => { img.src = DEFAULT_PLAYER_IMG; };
    imgWrap.appendChild(img);

    // Datos inferiores
    const info = document.createElement('div');
    info.className = 'player-card-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'player-card-name';
    nameEl.textContent = p.name;

    const metaEl = document.createElement('span');
    metaEl.className = 'player-card-meta';
    metaEl.textContent = p.team || 'Sin club';

    info.appendChild(nameEl);
    info.appendChild(metaEl);

    card.appendChild(imgWrap);
    card.appendChild(info);

    card.onclick = () => selectPlayer(p.name);
    list.appendChild(card);
  });
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.combo-wrap')) closeAllDropdowns();
});


// Listener para el input de texto del goleador (tecleo, enter y sugerencias)
const scorerInput = document.getElementById('answer-scorer');
if (scorerInput) {
  scorerInput.addEventListener('input', (e) => {
    window.handleTypingScorer(e.target.value);
  });

  scorerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const box = document.getElementById('suggestions-box');
      const firstItem = box ? box.querySelector('.sugg-name') : null;
      if (firstItem && box.style.display !== 'none') {
        window.selectPlayer(firstItem.textContent);
      } else {
        if (box) box.style.display = 'none';
        scorerInput.blur();
      }
    }
  });

  scorerInput.addEventListener('blur', () => {
    setTimeout(() => {
      const box = document.getElementById('suggestions-box');
      if (box) box.style.display = 'none';
    }, 200);
  });
}


  // cambio 2