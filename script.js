// --- 1. BASE DE DATOS DE VIDEOS ---
const videosDB = [
  {
    "id": 1,
    "youtube_id": "bajOQF-YG5g", 
    "goleador": "juanfer quintero",
    "resultado": "3-2",
    "partido": "Colo-Colo vs U. de Chile",
    "torneo": "Campeonato Nacional 2019"
  },
  {
    "id": 2,
    "youtube_id": "UjO9FNTkULo",
    "goleador": "Matías Fernández",
    "resultado": "1-2",
    "partido": "Toluca vs Colo-Colo",
    "torneo": "Copa Sudamericana 2006"
  }
];

// --- 2. VARIABLES Y ESTADO ---
let players = JSON.parse(localStorage.getItem('trivia_players')) || [];
let currentVideoIndex = parseInt(localStorage.getItem('trivia_video_index')) || 0;
let isGameActive = localStorage.getItem('trivia_active') === 'true';

// Elementos del DOM
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name');
const addPlayerBtn = document.getElementById('add-player-btn');
const playersList = document.getElementById('players-list');
const startGameBtn = document.getElementById('start-game-btn');
const rankingList = document.getElementById('ranking-list');
const youtubePlayer = document.getElementById('youtube-player');
const videoInfo = document.getElementById('video-info');
const scoreModal = document.getElementById('score-modal');
const modalPlayersList = document.getElementById('modal-players-list');
const modalAnswerKey = document.getElementById('modal-answer-key');

// --- 3. INICIALIZACIÓN ---
function init() {
    if (isGameActive && players.length > 0) {
        showGameScreen();
        renderRanking();
        loadVideo();
    } else {
        renderLobbyPlayers();
    }
}

// --- 4. LÓGICA DEL LOBBY ---
addPlayerBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name) {
        players.push({ name: name, score: 0 });
        playerNameInput.value = '';
        renderLobbyPlayers();
        saveState();
    }
});

function renderLobbyPlayers() {
    playersList.innerHTML = '';
    players.forEach((p, index) => {
        const li = document.createElement('li');
        li.className = 'bg-gray-700 p-2 rounded flex justify-between items-center';
        li.innerHTML = `<span>${p.name}</span> <button onclick="removePlayer(${index})" class="text-red-400 hover:text-red-300 font-bold">X</button>`;
        playersList.appendChild(li);
    });
    startGameBtn.classList.toggle('hidden', players.length < 2);
}

window.removePlayer = function(index) {
    players.splice(index, 1);
    renderLobbyPlayers();
    saveState();
};

startGameBtn.addEventListener('click', () => {
    isGameActive = true;
    currentVideoIndex = 0;
    saveState();
    showGameScreen();
    renderRanking();
    loadVideo();
});

// --- 5. LÓGICA DEL JUEGO ---
function showGameScreen() {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
}

function renderRanking() {
    // Ordenar por puntaje
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    rankingList.innerHTML = '';
    
    sortedPlayers.forEach((p, index) => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center bg-gray-700 p-3 rounded-lg border-l-4 ' + (index === 0 ? 'border-yellow-400' : 'border-blue-500');
        li.innerHTML = `<span class="font-bold text-lg">${index + 1}. ${p.name}</span> <span class="bg-gray-900 px-3 py-1 rounded text-green-400 font-mono text-xl">${p.score} pts</span>`;
        rankingList.appendChild(li);
    });
}

function loadVideo() {
    if (currentVideoIndex >= videosDB.length) {
        alert("¡No hay más videos! Fin del juego.");
        return;
    }
    const currentVideo = videosDB[currentVideoIndex];
    // Evita recargar el mismo iframe si ya está cargado
    const newSrc = `https://www.youtube.com/embed/${currentVideo.youtube_id}?rel=0`;
    if(youtubePlayer.src !== newSrc) {
        youtubePlayer.src = newSrc;
    }
    videoInfo.innerText = `Ronda ${currentVideoIndex + 1}: ${currentVideo.partido} (${currentVideo.torneo})`;
}

document.getElementById('next-video-btn').addEventListener('click', () => {
    if (currentVideoIndex < videosDB.length - 1) {
        currentVideoIndex++;
        saveState();
        loadVideo();
    } else {
        alert("¡Último video alcanzado!");
    }
});

// --- 6. LÓGICA DE PUNTUACIÓN (EL PANEL MAESTRO) ---
document.getElementById('open-modal-btn').addEventListener('click', () => {
    const currentVideo = videosDB[currentVideoIndex];
    // Mostrar respuestas correctas arriba para ayuda memoria
    modalAnswerKey.innerHTML = `<strong>Goleador:</strong> ${currentVideo.goleador} <br> <strong>Resultado:</strong> ${currentVideo.resultado}`;
    
    modalPlayersList.innerHTML = '';
    players.forEach((p, index) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-700 p-3 rounded';
        div.innerHTML = `
            <span class="font-bold w-1/3">${p.name}</span>
            <div class="flex gap-4 w-2/3 justify-end">
                <label class="flex items-center gap-1 cursor-pointer select-none">
                    <input type="checkbox" id="goleador-${index}" class="w-5 h-5 accent-blue-500">
                    <span class="text-sm">Goleador (+1)</span>
                </label>
                <label class="flex items-center gap-1 cursor-pointer select-none">
                    <input type="checkbox" id="marcador-${index}" class="w-5 h-5 accent-blue-500">
                    <span class="text-sm">Marcador (+2)</span>
                </label>
            </div>
        `;
        modalPlayersList.appendChild(div);
    });
    scoreModal.classList.remove('hidden');
});

document.getElementById('close-modal-btn').addEventListener('click', () => {
    scoreModal.classList.add('hidden');
});

document.getElementById('save-scores-btn').addEventListener('click', () => {
    players.forEach((p, index) => {
        const hitGoleador = document.getElementById(`goleador-${index}`).checked;
        const hitMarcador = document.getElementById(`marcador-${index}`).checked;
        
        if (hitGoleador) p.score += 1;
        if (hitMarcador) p.score += 2;
    });
    
    saveState();
    renderRanking();
    scoreModal.classList.add('hidden');
});

// --- 7. UTILIDADES ---
function saveState() {
    localStorage.setItem('trivia_players', JSON.stringify(players));
    localStorage.setItem('trivia_video_index', currentVideoIndex);
    localStorage.setItem('trivia_active', isGameActive);
}

document.getElementById('reset-game-btn').addEventListener('click', () => {
    if(confirm('¿Seguro que quieres borrar la partida actual?')) {
        localStorage.clear();
        location.reload(); // Recarga la página para volver al lobby
    }
});

// Arrancar el código al cargar
init();