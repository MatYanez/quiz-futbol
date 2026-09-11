import { db, ref, set, update, onValue } from "./firebase-config.js";
import { showNotification, showConfirm } from "./modal.js";

let ROOM_ID = null;
let roomsData = {};
let players = {};
let round = 1;
let revealed = false;
let blurAmount = 1.5; // Muy sutil, solo para suavizar bordes de texto
let qrInstance = null;

// Filtro Espectral Invertido (Cámara Negativa / Azul-Magenta Neón):
// 1. invert(1): Blancos pasan a negros, pasto pasa a púrpura/magenta
// 2. hue-rotate(190deg): Vira todo hacia tonos cian, azul profundo y rosado antinatural
// 3. contrast(2.3) + brightness(1.1): Hace destacar el balón y las siluetas sin revelar logos
// 4. drop-shadow: Desfasa bordes ópticos para que los dorsales y caras no se puedan leer
const ANON_COLOR = 'invert(1) hue-rotate(190deg) contrast(2.3) brightness(1.05) drop-shadow(2px 0px 1px rgba(255, 0, 128, 0.7)) drop-shadow(-2px 0px 1px rgba(0, 255, 255, 0.7))';
const CAT_PTS = { jugador: 3, partido: 2, marcador: 1 };

function currentFilter() {
  return revealed ? 'none' : `blur(${blurAmount}px) ${ANON_COLOR}`;
}

function refreshMediaFilter() {
  const media = document.querySelector('#video-frame video, #video-frame iframe');
  if (media) media.style.filter = currentFilter();
}

// --- 1. EXPLORADOR DE SALAS ---
function listenAllRooms() {
  onValue(ref(db, 'rooms'), (snapshot) => {
    roomsData = snapshot.val() || {};
    renderRoomsList();
  });
}

function renderRoomsList() {
  const list = document.getElementById('rooms-list');
  const roomKeys = Object.keys(roomsData);

  if (!roomKeys.length) {
    list.innerHTML = '<p class="empty">No hay salas abiertas. ¡Crea una arriba!</p>';
    return;
  }

  list.innerHTML = roomKeys.map(code => {
    const r = roomsData[code];
    const pCount = r.players ? Object.keys(r.players).length : 0;
    return `
      <div class="room-item-card">
        <div>
          <strong>${code}</strong>
          <div class="room-meta">Ronda: ${r.round || 1} · ${pCount} jugador(es)</div>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn-gold" style="padding: 6px 12px; font-size: 11px;" onclick="window.enterRoom('${code}')">Entrar</button>
          <button class="btn-danger" style="padding: 6px 8px; font-size: 11px;" onclick="window.deleteRoom('${code}')">✕</button>
        </div>
      </div>
    `;
  }).join('');
}



window.enterRoom = function(code) {
  ROOM_ID = code;
  document.getElementById('display-room-code').textContent = ROOM_ID;
  document.getElementById('room-badge').textContent = ROOM_ID;

  document.getElementById('browser-view').style.display = 'none';
  document.getElementById('setup-view').style.display = 'block';

  generateQR();

  // 1. Escuchar la información general de la sala (ronda y estado de revelado)
  onValue(ref(db, `rooms/${ROOM_ID}`), (snapshot) => {
    const roomData = snapshot.val();
    if (!roomData) return;
    
    if (roomData.round) {
      round = roomData.round;
      document.getElementById('round-num').textContent = round;
    }
    revealed = !!roomData.revealed;
    document.getElementById('video-data-card').classList.toggle('is-revealed', revealed);
    document.getElementById('reveal-btn').textContent = revealed ? 'Ocultar video' : 'Revelar video';
    refreshMediaFilter();
  });

  // 2. Escuchar a los jugadores de esta sala específica
  onValue(ref(db, `rooms/${ROOM_ID}/players`), (snapshot) => {
    players = snapshot.val() || {};
    renderSetup();
    renderSidebar();
    checkAllSubmitted();
  });
};

window.backToBrowser = function() {
  ROOM_ID = null;
  document.getElementById('setup-view').style.display = 'none';
  document.getElementById('play-view').style.display = 'none';
  document.getElementById('browser-view').style.display = 'block';
};



// --- 2. QR CODE ---
function generateQR() {
  const qrBox = document.getElementById('qrcode-container');
  if (!qrBox || typeof QRCode === 'undefined') return;

  qrBox.innerHTML = '';
  const currentOrigin = window.location.origin;
  const currentPath = window.location.pathname.replace('index.html', '');
  const joinUrl = `${currentOrigin}${currentPath}play.html?room=${ROOM_ID}`;

  qrInstance = new QRCode(qrBox, {
    text: joinUrl,
    width: 130,
    height: 130,
    colorDark: "#0B2A1F",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
}

function checkAllSubmitted() {
  const playerArray = Object.values(players);
  const total = playerArray.length;
  const submitted = playerArray.filter(p => p.submitted).length;
  const btnAssign = document.getElementById('open-assign');
  const allReady = total > 0 && submitted === total;
  
  if (allReady) {
    btnAssign.disabled = false;
    btnAssign.style.opacity = '1';
    btnAssign.style.cursor = 'pointer';
    btnAssign.textContent = `Asignar puntos (${submitted}/${total} listos)`;
    btnAssign.classList.add('ready-pulse');
  } else {
    btnAssign.disabled = true;
    btnAssign.style.opacity = '0.4';
    btnAssign.style.cursor = 'not-allowed';
    btnAssign.textContent = `Esperando respuestas (${submitted}/${total})`;
    btnAssign.classList.remove('ready-pulse');
  }
}

function renderSetup() {
  const list = document.getElementById('setup-list');
  const playerArray = Object.values(players);
  list.innerHTML = playerArray.length ? playerArray.map(p => `
    <div class="setup-item">
      <span>${p.avatar || '⚽'} ${p.name}</span>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size: 11px; color: var(--gold);">Conectado</span>
        <button class="kick-btn" onclick="window.kickPlayer('${p.id}')">Kick</button>
      </div>
    </div>
  `).join('') : '<p class="empty">Esperando que se conecten desde el celular...</p>';
}

window.createRoom = async function() {
  const input = document.getElementById('new-room-input');
  const code = input.value.trim().toUpperCase().replace(/\s+/g, '-');
  const packSelect = document.getElementById('create-pack-select');
  const packIndex = packSelect ? parseInt(packSelect.value, 10) : 0;

  if (!code) {
    return showNotification({
      title: 'Campo vacío',
      message: 'Ingresa un código para crear la nueva sala.',
      icon: '⚠️'
    });
  }

  set(ref(db, `rooms/${code}`), {
    round: 1,
    revealed: false,
    packIndex: packIndex,
    createdAt: Date.now()
  });

  input.value = '';
  window.enterRoom(code);
};

window.deleteRoom = async function(code) {
  const confirmed = await showConfirm({
    title: 'Eliminar Sala',
    message: `¿Seguro que deseas destruir la sala ${code}? Se desconectará a todos los participantes.`,
    icon: '🗑️',
    confirmText: 'Sí, eliminar',
    cancelText: 'Volver'
  });

  if (!confirmed) return;

  set(ref(db, `rooms/${code}`), null);
  if (ROOM_ID === code) {
    window.backToBrowser();
  }
};

window.kickPlayer = async function(pid) {
  const player = players[pid];
  const name = player ? player.name : 'este jugador';
  
  const confirmed = await showConfirm({
    title: 'Expulsar Jugador',
    message: `¿Estás seguro de que quieres expulsar a ${name} de la partida?`,
    icon: '🚷',
    confirmText: 'Expulsar',
    cancelText: 'Cancelar'
  });

  if (!confirmed) return;
  set(ref(db, `rooms/${ROOM_ID}/players/${pid}`), null);
};

function startGame() {
  if (Object.keys(players).length < 1) {
    return showNotification({
      title: 'Faltan Jugadores',
      message: 'Debes esperar a que al menos un participante se conecte desde su celular para iniciar.',
      icon: '👥'
    });
  }
  document.getElementById('setup-view').style.display = 'none';
  document.getElementById('play-view').style.display = 'flex';
  
  // Barajar aleatoriamente las jugadas del paquete seleccionado sin repetir
  initRoomPlaylist();

  checkAllSubmitted();
  renderSidebar();
}

function itemHtml(p, i, deltaHtml = '', floaterHtml = '') {
  const statusLabel = p.submitted ? '<span class="status-dot done"></span> Listo' : '<span class="status-dot wait"></span> Pensando...';
  return `<div class="rank-row ${i === 0 && (p.score || 0) > 0 ? 'leader' : ''}" data-pid="${p.id}" style="position: relative;">
    <span class="rank-num">${i + 1}</span>
    <div class="rank-avatar">${p.avatar || '⚽'}</div>
    <div class="rank-info">
      <div style="display: flex; align-items: center;">
        <span class="rank-name">${p.name}</span>
        ${deltaHtml}
      </div>
      <span class="rank-status">${statusLabel}</span>
    </div>
    <span class="rank-score">${p.score || 0}</span>
    ${floaterHtml}
  </div>`;
}

function renderSidebar() {
  const container = document.getElementById('sidebar-list');
  const sorted = Object.values(players).sort((a, b) => (b.score || 0) - (a.score || 0));
  container.innerHTML = sorted.map((p, i) => itemHtml(p, i)).join('');
}

function cleanString(str) {
  return (str || '')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function syncReviewVideo() {
  const sourceMedia = document.querySelector('#video-frame video, #video-frame iframe');
  const targetBox = document.getElementById('review-video-box');
  targetBox.innerHTML = '';

  if (sourceMedia) {
    if (sourceMedia.tagName.toLowerCase() === 'iframe') {
      targetBox.innerHTML = `<iframe src="${sourceMedia.src}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    } else {
      targetBox.innerHTML = `<video src="${sourceMedia.src}" controls autoplay loop></video>`;
    }
  } else {
    targetBox.innerHTML = '<p class="empty" style="padding-top: 50px;">No hay video cargado</p>';
  }

  const loc = document.getElementById('v-local').value.trim() || 'Local';
  const vis = document.getElementById('v-visita').value.trim() || 'Visita';
  const jug = document.getElementById('v-jugador').value.trim() || 'No especificado';
  const marc = document.getElementById('v-marcador').value.trim() || '0-0';

  document.getElementById('ref-jugador').textContent = jug;
  document.getElementById('ref-marcador').textContent = marc;
  document.getElementById('ref-partido').textContent = `${loc} vs ${vis}`;
}

let calculatedGains = {};

function renderAssignRows() {
  const container = document.getElementById('assign-table-body');
  const playerList = Object.values(players);

  const officialScorer = cleanString(document.getElementById('v-jugador').value);
  const officialScore = cleanString(document.getElementById('v-marcador').value).replace(/\s+/g, '');

  calculatedGains = {};

  container.innerHTML = playerList.map(p => {
    const last = p.lastAnswer || { scorer: 'Sin respuesta', home: 0, away: 0 };
    const playerScorer = cleanString(last.scorer);
    const playerScoreStr = `${last.home}-${last.away}`;

    const hitScorer = officialScorer.length > 2 && (officialScorer.includes(playerScorer) || playerScorer.includes(officialScorer));
    const hitScore = officialScore.length >= 3 && officialScore === playerScoreStr;

    let gain = 0;
    if (hitScorer) gain += CAT_PTS.jugador;
    if (hitScore) gain += CAT_PTS.marcador;

    calculatedGains[p.id] = gain;

    return `
      <div class="review-table-row ${gain > 0 ? 'correct-hit' : ''}">
        <div class="cell-player">
          <span>${p.avatar || '⚽'}</span>
          <span>${p.name}</span>
        </div>
        <div class="cell-val">
          <span class="badge-hit ${hitScorer ? 'yes' : 'no'}">${hitScorer ? '✓' : '✕'}</span>
          <span>${last.scorer}</span>
        </div>
        <div class="cell-val">
          <span class="badge-hit ${hitScore ? 'yes' : 'no'}">${hitScore ? '✓' : '✕'}</span>
          <span>${last.home} - ${last.away}</span>
        </div>
        <div class="cell-pts-gain">
          +${gain}
        </div>
      </div>
    `;
  }).join('');
}

function openAssign() {
  const playerArray = Object.values(players);
  const total = playerArray.length;
  const submitted = playerArray.filter(p => p.submitted).length;

  if (total === 0 || submitted < total) {
    return showNotification({
      title: 'Respuestas pendientes',
      message: 'Aún faltan jugadores por enviar su predicción. Deben contestar todos antes de evaluar.',
      icon: '⏳'
    });
  }

  update(ref(db, `rooms/${ROOM_ID}`), { pointsAssigning: true });

  syncReviewVideo();
  renderAssignRows();
  document.getElementById('assign-modal').classList.add('open');
}

function closeAssignOnly() {
  document.getElementById('assign-modal').classList.remove('open');
}

async function saveAssign() {
  const updates = {};
  const gainsSnapshot = { ...calculatedGains };

  // 1. Guardar las posiciones previas de cada jugador en el DOM
  const prevRankList = Object.values(players).sort((a, b) => (b.score || 0) - (a.score || 0));
  const oldPositions = {};
  prevRankList.forEach((p, idx) => { oldPositions[p.id] = idx; });

  const oldElements = {};
  document.querySelectorAll('#sidebar-list .rank-row').forEach(el => {
    const pid = el.dataset.pid;
    if (pid) oldElements[pid] = el.getBoundingClientRect();
  });

  // 2. Preparar el lote de actualización para Firebase
  Object.keys(players).forEach(pid => {
    const p = players[pid];
    const gain = gainsSnapshot[pid] || 0;
    const currentScore = p.score || 0;
    updates[`rooms/${ROOM_ID}/players/${pid}/score`] = currentScore + gain;
    p.score = currentScore + gain;
  });

  // Cerrar el modal para enfocar la tabla principal
  closeAssignOnly();

  // 3. Renderizar la tabla reordenada con los nuevos puestos
  const container = document.getElementById('sidebar-list');
  const updatedRankList = Object.values(players).sort((a, b) => (b.score || 0) - (a.score || 0));

  container.innerHTML = updatedRankList.map((p, newIdx) => {
    const oldIdx = oldPositions[p.id];
    let deltaHtml = '';
    if (oldIdx !== undefined) {
      if (newIdx < oldIdx) {
        deltaHtml = `<span class="rank-delta up">▲ +${oldIdx - newIdx}</span>`;
      } else if (newIdx > oldIdx) {
        deltaHtml = `<span class="rank-delta down">▼ -${newIdx - oldIdx}</span>`;
      } else {
        deltaHtml = `<span class="rank-delta same">● 0</span>`;
      }
    }

    const gain = gainsSnapshot[p.id] || 0;
    const floaterHtml = (gain > 0) ? `<div class="score-floater">+${gain} PTS</div>` : '';
    return itemHtml(p, newIdx, deltaHtml, floaterHtml);
  }).join('');

  // 4. Ejecutar la animación FLIP
  requestAnimationFrame(() => {
    document.querySelectorAll('#sidebar-list .rank-row').forEach(newEl => {
      const pid = newEl.dataset.pid;
      const oldRect = oldElements[pid];
      if (oldRect) {
        const newRect = newEl.getBoundingClientRect();
        const deltaY = oldRect.top - newRect.top;

        if (deltaY !== 0) {
          newEl.style.transform = `translateY(${deltaY}px)`;
          newEl.style.transition = 'none';

          requestAnimationFrame(() => {
            newEl.style.transition = 'transform 800ms cubic-bezier(0.2, 0.9, 0.3, 1.2)';
            newEl.style.transform = 'translateY(0)';
          });
        }
      }
    });
  });

  // Habilitar el botón de Siguiente Jugada ahora que los puntos están asignados
  const nextBtn = document.getElementById('next-video-btn');
  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.style.opacity = '1';
    nextBtn.style.cursor = 'pointer';
    nextBtn.classList.remove('btn-muted');
    nextBtn.classList.add('btn-gold', 'ready-pulse');
  }

  // 5. Enviar actualización a Firebase en segundo plano
  await update(ref(db), updates);
}

function toggleReveal() {
  revealed = !revealed;
  document.getElementById('video-data-card').classList.toggle('is-revealed', revealed);
  document.getElementById('reveal-btn').textContent = revealed ? 'Ocultar video' : 'Revelar video';
  update(ref(db, `rooms/${ROOM_ID}`), { revealed });
  refreshMediaFilter();
}



// --- GESTIÓN ALEATORIA DE PARTIDOS DESDE data/matches.json ---
let MATCH_PACKS = [];
let roomPlaylist = [];
let currentPlaylistIndex = 0;

async function loadMatchesDatabase() {
  try {
    const res = await fetch('data/matches.json');
    MATCH_PACKS = await res.json();
    populateCreatePackSelect();
  } catch (err) {
    MATCH_PACKS = [];
  }
}

function populateCreatePackSelect() {
  const packSelect = document.getElementById('create-pack-select');
  if (!packSelect || !MATCH_PACKS.length) return;

  packSelect.innerHTML = MATCH_PACKS.map((p, idx) => `
    <option value="${idx}">⚽ ${p.pack} (${p.matches.length} jugadas)</option>
  `).join('');
}

function shuffleMatches(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function initRoomPlaylist() {
  const roomData = roomsData[ROOM_ID] || {};
  const packIdx = roomData.packIndex || 0;
  const activePack = MATCH_PACKS[packIdx] || MATCH_PACKS[0];

  if (!activePack || !activePack.matches.length) return;

  document.getElementById('active-pack-title').textContent = activePack.pack;
  
  // Barajar jugadas para que salgan en orden aleatorio sin repetirse
  roomPlaylist = shuffleMatches(activePack.matches);
  currentPlaylistIndex = 0;

  loadMatchAtIndex(0);
}

function loadMatchAtIndex(index) {
  if (!roomPlaylist[index]) return;
  const match = roomPlaylist[index];
  currentPlaylistIndex = index;

  // Actualizar contador visual
  document.getElementById('pack-progress').textContent = `${index + 1}/${roomPlaylist.length}`;

  // Cargar datos oficiales secretos
  document.getElementById('v-local').value = match.homeTeam || '';
  document.getElementById('v-visita').value = match.awayTeam || '';
  document.getElementById('v-jugador').value = match.scorer || '';
  document.getElementById('v-marcador').value = match.score || '';

  // Inyectar mute=1, controls=0 y modestbranding para ocultar audio y controles delatanes
  const ytId = getYouTubeId(match.videoUrl);
  const driveId = getDriveId(match.videoUrl);
  const frame = document.getElementById('video-frame');
  let embedSrc = null;

  if (ytId) {
    embedSrc = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`;
  } else if (driveId) {
    embedSrc = `https://drive.google.com/file/d/${driveId}/preview`;
  }

  if (embedSrc) {
    frame.classList.add('has-video');
    frame.innerHTML = `
      <div class="video-censor-top">
        <span class="video-censor-badge">⚽ Jugada en misterio</span>
      </div>
      <iframe src="${embedSrc}" allow="autoplay; encrypted-media" allowfullscreen style="filter: ${currentFilter()}"></iframe>
      <div class="video-censor-bottom"></div>
    `;
  }
}

function nextVideo() {
  const nextBtn = document.getElementById('next-video-btn');
  if (nextBtn && nextBtn.disabled) return;

  // Comprobar si quedan jugadas en el paquete
  if (currentPlaylistIndex + 1 >= roomPlaylist.length) {
    return showNotification({
      title: '¡Fin del paquete!',
      message: 'Ya se jugaron todos los videos de esta temática.',
      icon: '🏁'
    });
  }

  round += 1;
  document.getElementById('round-num').textContent = round;
  revealed = false;
  refreshMediaFilter();

  // Volver a bloquear el botón de siguiente jugada para la nueva ronda
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.style.opacity = '0.35';
    nextBtn.style.cursor = 'not-allowed';
    nextBtn.classList.remove('btn-gold', 'ready-pulse');
    nextBtn.classList.add('btn-muted');
  }

  // Cargar el siguiente video aleatorio
  loadMatchAtIndex(currentPlaylistIndex + 1);

  // Limpiar estados de jugadores en Firebase para la nueva ronda
  const updates = {};
  updates[`rooms/${ROOM_ID}/round`] = round;
  updates[`rooms/${ROOM_ID}/revealed`] = false;
  updates[`rooms/${ROOM_ID}/pointsAssigning`] = false;
  Object.keys(players).forEach(pid => {
    updates[`rooms/${ROOM_ID}/players/${pid}/submitted`] = false;
    updates[`rooms/${ROOM_ID}/players/${pid}/lastAnswer`] = null;
    updates[`rooms/${ROOM_ID}/players/${pid}/answered`] = { jugador: false, partido: false, marcador: false };
  });
  update(ref(db), updates);
}

function getYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}
function getDriveId(url) {
  const match = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}


function setupVideoFrame() {
  const frame = document.getElementById('video-frame');
  const fileInput = document.getElementById('video-file');
  frame.addEventListener('click', () => { if (!frame.classList.contains('has-video')) fileInput.click(); });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    frame.classList.add('has-video');
    frame.innerHTML = `
      <video src="${url}" controls autoplay loop style="filter: ${currentFilter()}"></video>
      <button class="swap-video-btn" id="swap-video">Cambiar video</button>
    `;
    document.getElementById('swap-video').addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.value = '';
      frame.classList.remove('has-video');
      frame.innerHTML = `<div class="play-dot">▶</div><p>Haz clic para cargar un video y probar cómo se ve</p>`;
    });
  });
}

function setupBlurSlider() {
  const slider = document.getElementById('blur-slider');
  if (!slider) return;
  // Ajustamos el rango: de 1px (casi nítido) a 10px (máximo razonable para siluetas)
  slider.min = "1";
  slider.max = "10";
  slider.value = "4";
  document.getElementById('blur-value').textContent = '4px';

  slider.addEventListener('input', () => {
    blurAmount = Number(slider.value);
    document.getElementById('blur-value').textContent = blurAmount + 'px';
    refreshMediaFilter();
  });
}

document.getElementById('create-room-btn').addEventListener('click', window.createRoom);
document.getElementById('delete-room-btn').addEventListener('click', () => window.deleteRoom(ROOM_ID));
document.getElementById('back-to-browser').addEventListener('click', window.backToBrowser);
document.getElementById('start-game').addEventListener('click', startGame);
document.getElementById('open-assign').addEventListener('click', openAssign);
document.getElementById('close-assign').addEventListener('click', closeAssignOnly);
document.getElementById('save-assign').addEventListener('click', saveAssign);
document.getElementById('assign-modal').addEventListener('click', (e) => { if (e.target.id === 'assign-modal') closeAssignOnly(); });
document.getElementById('next-video-btn').addEventListener('click', nextVideo);

loadMatchesDatabase();
listenAllRooms();
setupVideoFrame();
setupBlurSlider();

  // my