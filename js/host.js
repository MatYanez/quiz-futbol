import { db, ref, set, update, onValue } from "./firebase-config.js";
import { showNotification, showConfirm } from "./modal.js";

let ROOM_ID = null;
let roomsData = {};
let players = {};
let round = 1;
let revealed = false;
let blurAmount = 10;
let qrInstance = null;
const ANON_COLOR = 'grayscale(1) sepia(1) hue-rotate(268deg) saturate(9) contrast(1.4) brightness(1.05)';
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
  const btnReveal = document.getElementById('reveal-btn');
  const btnAssign = document.getElementById('open-assign');
  const allReady = total > 0 && submitted === total;
  
  if (allReady) {
    btnReveal.disabled = false;
    btnReveal.textContent = `Revelar video (${submitted}/${total} listos)`;
    btnReveal.classList.add('ready-pulse');

    btnAssign.disabled = false;
    btnAssign.style.opacity = '1';
    btnAssign.style.cursor = 'pointer';
  } else {
    btnReveal.disabled = true;
    btnReveal.textContent = `Esperando respuestas (${submitted}/${total})`;
    btnReveal.classList.remove('ready-pulse');

    btnAssign.disabled = true;
    btnAssign.style.opacity = '0.4';
    btnAssign.style.cursor = 'not-allowed';
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




function closeAssignOnly() {
  document.getElementById('assign-modal').classList.remove('open');
}


// Clonar el video actual para reproducirlo en el modal de evaluación
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

  // Cargar las respuestas oficiales colocadas en el Host
  const loc = document.getElementById('v-local').value.trim() || 'Local';
  const vis = document.getElementById('v-visita').value.trim() || 'Visita';
  const jug = document.getElementById('v-jugador').value.trim() || 'No especificado';
  const marc = document.getElementById('v-marcador').value.trim() || '-';

  document.getElementById('ref-jugador').textContent = jug;
  document.getElementById('ref-partido').textContent = `${loc} vs ${vis}`;
  document.getElementById('ref-marcador').textContent = marc;
}

function renderAssignRows() {
  const container = document.getElementById('assign-rows');
  const playerList = Object.values(players);

  container.innerHTML = playerList.map(p => {
    const ans = p.answered || {};
    const last = p.lastAnswer || { scorer: 'Sin respuesta', home: 0, away: 0 };
    return `
      <div class="player-eval-card" data-pid="${p.id}">
        <div class="eval-meta">
          <strong>${p.avatar || '⚽'} ${p.name}</strong>
          <span style="font-size:12px; color:var(--gold); font-weight:bold;">${p.score || 0} pts</span>
        </div>
        <div class="eval-answer-box">
          <div>🎯 <b>Goleador:</b> "${last.scorer}"</div>
          <div>🔢 <b>Marcador dicho:</b> ${last.home} - ${last.away}</div>
        </div>
        <div class="eval-checkboxes">
          <label><input type="checkbox" data-cat="jugador" ${ans.jugador ? 'checked disabled' : ''} /> Jugador (+3)</label>
          <label><input type="checkbox" data-cat="partido" ${ans.partido ? 'checked disabled' : ''} /> Partido (+2)</label>
          <label><input type="checkbox" data-cat="marcador" ${ans.marcador ? 'checked disabled' : ''} /> Marcador (+1)</label>
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

  // 1. Bloqueo en celulares
  update(ref(db, `rooms/${ROOM_ID}`), { pointsAssigning: true });

  // 2. Cargar video y respuestas
  syncReviewVideo();
  renderAssignRows();
  document.getElementById('assign-modal').classList.add('open');
}

// --- CEREMONIA Y ANIMACIÓN ESTILO MARIO KART ---
async function saveAssign() {
  const pointGains = {};
  const updates = {};

  // 1. Calcular puntos ganados en esta ronda
  document.querySelectorAll('#assign-rows .player-eval-card').forEach(card => {
    const pid = card.dataset.pid;
    const p = players[pid];
    if (!p) return;
    const ans = p.answered || { jugador: false, partido: false, marcador: false };
    let gain = 0;

    card.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const cat = cb.dataset.cat;
      if (cb.checked && !ans[cat]) {
        gain += CAT_PTS[cat];
        ans[cat] = true;
      }
    });

    pointGains[pid] = gain;
    updates[`rooms/${ROOM_ID}/players/${pid}/score`] = (p.score || 0) + gain;
    updates[`rooms/${ROOM_ID}/players/${pid}/answered`] = ans;
  });

  // Cerrar el modal para volver a la pantalla principal
  closeAssignOnly();

  // Guardar estado previo para la animación FLIP
  const prevRankList = Object.values(players).sort((a, b) => (b.score || 0) - (a.score || 0));
  const oldPositions = {};
  prevRankList.forEach((p, idx) => { oldPositions[p.id] = idx; });

  const oldElements = {};
  document.querySelectorAll('#sidebar-list .rank-row').forEach(el => {
    oldElements[el.dataset.pid] = el.getBoundingClientRect();
  });

  // 2. Persistir en Firebase
  await update(ref(db), updates);

  // 3. Renderizar nueva tabla con flechas e indicadores
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

    const floaterHtml = (pointGains[p.id] > 0) ? `<div class="score-floater">+${pointGains[p.id]} PTS</div>` : '';
    return itemHtml(p, newIdx, deltaHtml, floaterHtml);
  }).join('');

  // 4. Animar el intercambio de posiciones (FLIP Animation)
  document.querySelectorAll('#sidebar-list .rank-row').forEach(newEl => {
    const pid = newEl.dataset.pid;
    const oldRect = oldElements[pid];
    if (oldRect) {
      const newRect = newEl.getBoundingClientRect();
      const deltaY = oldRect.top - newRect.top;

      // Invertir posición inicial
      newEl.style.transform = `translateY(${deltaY}px)`;
      newEl.style.transition = 'none';

      // Reproducir hacia la nueva posición
      requestAnimationFrame(() => {
        newEl.style.transition = 'transform 700ms cubic-bezier(0.2, 0.9, 0.3, 1.2)';
        newEl.style.transform = 'translateY(0)';
      });
    }
  });
}


function toggleReveal() {
  revealed = !revealed;
  document.getElementById('video-data-card').classList.toggle('is-revealed', revealed);
  document.getElementById('reveal-btn').textContent = revealed ? 'Ocultar video' : 'Revelar video';
  update(ref(db, `rooms/${ROOM_ID}`), { revealed });
  refreshMediaFilter();
}



function nextVideo() {
  round += 1;
  document.getElementById('round-num').textContent = round;
  document.getElementById('v-local').value = '';
  document.getElementById('v-visita').value = '';
  document.getElementById('v-jugador').value = '';
  document.getElementById('v-marcador').value = '';
  revealed = false;
  document.getElementById('video-data-card').classList.remove('is-revealed');
  refreshMediaFilter();

  const updates = {};
  updates[`rooms/${ROOM_ID}/round`] = round;
  updates[`rooms/${ROOM_ID}/revealed`] = false;
  updates[`rooms/${ROOM_ID}/pointsAssigning`] = false; // Se levanta el bloqueo para la nueva ronda
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

function loadYouTube() {
  const input = document.getElementById('yt-url');
  const raw = input.value.trim();
  const ytId = getYouTubeId(raw);
  const driveId = getDriveId(raw);
  const frame = document.getElementById('video-frame');
  let embedSrc = null;
  if (ytId) embedSrc = `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`;
  else if (driveId) embedSrc = `https://drive.google.com/file/d/${driveId}/preview`;

  if (!embedSrc) {
    input.style.borderColor = 'var(--red)';
    setTimeout(() => { input.style.borderColor = ''; }, 1200);
    return;
  }

  frame.classList.add('has-video');
  frame.innerHTML = `
    <iframe src="${embedSrc}" allow="autoplay; encrypted-media" allowfullscreen style="filter: ${currentFilter()}"></iframe>
    <button class="swap-video-btn" id="swap-video">Cambiar video</button>
  `;
  document.getElementById('swap-video').addEventListener('click', (e) => {
    e.stopPropagation();
    frame.classList.remove('has-video');
    frame.innerHTML = `<div class="play-dot">▶</div><p>Haz clic para cargar un video y probar cómo se ve</p>`;
  });
  input.value = '';
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
document.getElementById('load-yt').addEventListener('click', loadYouTube);
document.getElementById('yt-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadYouTube(); });
document.getElementById('reveal-btn').addEventListener('click', toggleReveal);
document.getElementById('next-video-btn').addEventListener('click', nextVideo);

listenAllRooms();
setupVideoFrame();
setupBlurSlider();