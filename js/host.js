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
  const btn = document.getElementById('reveal-btn');
  
  if (total > 0 && submitted === total) {
    btn.disabled = false;
    btn.textContent = `Revelar video (${submitted}/${total} listos)`;
    btn.classList.add('ready-pulse');
  } else {
    btn.disabled = true;
    btn.textContent = `Esperando respuestas (${submitted}/${total})`;
    btn.classList.remove('ready-pulse');
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

function itemHtml(p, i) {
  const statusLabel = p.submitted ? '<span class="status-dot done"></span> Listo' : '<span class="status-dot wait"></span> Pensando...';
  return `<div class="rank-row ${i === 0 && (p.score || 0) > 0 ? 'leader' : ''}">
    <span class="rank-num">${i + 1}</span>
    <div class="rank-avatar">${p.avatar || '⚽'}</div>
    <div class="rank-info">
      <span class="rank-name">${p.name}</span>
      <span class="rank-status">${statusLabel}</span>
    </div>
    <span class="rank-score">${p.score || 0}</span>
  </div>`;
}

function renderSidebar() {
  const container = document.getElementById('sidebar-list');
  const sorted = Object.values(players).sort((a, b) => (b.score || 0) - (a.score || 0));
  container.innerHTML = sorted.map((p, i) => itemHtml(p, i)).join('');
}

function renderAssignRows() {
  const rows = document.getElementById('assign-rows');
  rows.innerHTML = Object.values(players).map(p => {
    const ans = p.answered || {};
    return `
      <div class="assign-row" data-pid="${p.id}">
        <div style="display:flex; flex-direction:column;">
          <span class="name">${p.avatar || '⚽'} ${p.name}</span>
          <span style="font-size: 10px; color: var(--gold);">${p.lastAnswer ? `R: ${p.lastAnswer.scorer} (${p.lastAnswer.home}-${p.lastAnswer.away})` : 'Sin respuesta'}</span>
        </div>
        <input type="checkbox" data-cat="jugador" ${ans.jugador ? 'checked disabled' : ''} />
        <input type="checkbox" data-cat="partido" ${ans.partido ? 'checked disabled' : ''} />
        <input type="checkbox" data-cat="marcador" ${ans.marcador ? 'checked disabled' : ''} />
      </div>
    `;
  }).join('');
}

function openAssign() {
  renderAssignRows();
  document.getElementById('assign-modal').classList.add('open');
}

function closeAssignOnly() {
  document.getElementById('assign-modal').classList.remove('open');
}

function saveAssign() {
  const updates = {};
  document.querySelectorAll('#assign-rows .assign-row').forEach(row => {
    const pid = row.dataset.pid;
    const p = players[pid];
    if (!p) return;
    const ans = p.answered || { jugador: false, partido: false, marcador: false };
    let newScore = p.score || 0;

    row.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const cat = cb.dataset.cat;
      if (cb.checked && !ans[cat]) {
        newScore += CAT_PTS[cat];
        ans[cat] = true;
      }
    });

    updates[`rooms/${ROOM_ID}/players/${pid}/score`] = newScore;
    updates[`rooms/${ROOM_ID}/players/${pid}/answered`] = ans;
  });

  update(ref(db), updates);
  closeAssignOnly();
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