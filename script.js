// --- 1. BASE DE DATOS DE VIDEOS ---
const videosDB = [
    {
        id: 1,
        youtube_id_recortado: "bajOQF-YG5g", // Corregido: sin comillas erróneas en las variables
        youtube_id_completo: "PON_AQUI_EL_ID_COMPLETO", 
        goleador: "Jugador X",
        resultado: "X-X",
        partido: "Equipo A vs Equipo B",
        torneo: "Mundial / Torneo"
    },
    {
        id: 2,
        youtube_id_recortado: "https://www.youtube.com/watch?v=7tN223Lp0yQ", 
        youtube_id_completo: "https://youtu.be/H62b1uDqFvY", 
        goleador: "Esteban Paredes",
        resultado: "3-2",
        partido: "Colo-Colo vs U. de Chile",
        torneo: "Campeonato 2019"
    }
];

// --- 2. VARIABLES Y ESTADO ---
let players = JSON.parse(localStorage.getItem('trivia_players')) || [];
let currentVideoIndex = parseInt(localStorage.getItem('trivia_video_index')) || 0;
let isGameActive = localStorage.getItem('trivia_active') === 'true';

// Elementos del DOM cacheados para evitar errores de botones que no responden
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const playersList = document.getElementById('players-list');
const rankingList = document.getElementById('ranking-list');
const youtubePlayer = document.getElementById('youtube-player');
const videoInfo = document.getElementById('video-info');
const scoreModal = document.getElementById('score-modal');
const startGameBtn = document.getElementById('start-game-btn');
const revealVideoBtn = document.getElementById('reveal-video-btn');
const modalAnswerKey = document.getElementById('modal-answer-key');
const modalPlayersList = document.getElementById('modal-players-list');

// --- 3. EXTRACTOR INTELIGENTE DE YOUTUBE ---
function extractYouTubeID(urlOrId) {
    if (!urlOrId) return '';
    // Si ya es un ID de 11 caracteres, lo devuelve tal cual
    if (urlOrId.length === 11 && !urlOrId.includes('http')) return urlOrId;
    // Si es un link, extrae solo el código
    const match = urlOrId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : urlOrId;
}

// --- 4. INICIALIZACIÓN ---
function init() {
    if (isGameActive && players.length > 0) {
        showGameScreen();
        renderRanking();
        loadVideo();
    } else {
        renderLobbyPlayers();
    }
}

// --- 5. LÓGICA DEL LOBBY ---
document.getElementById('add-player-btn').addEventListener('click', () => {
    const input = document.getElementById('player-name');
    const name = input.value.trim();
    if (name) {
        players.push({ name: name, score: 0 });
        input.value = '';
        renderLobbyPlayers();
        saveState();
    }
});

function renderLobbyPlayers() {
    playersList.innerHTML = '';
    players.forEach((p, index) => {
        playersList.innerHTML += `
            <li class='bg-gray-700 p-2 rounded flex justify-between items-center'>
                <span>${p.name}</span> 
                <button onclick="removePlayer(${index})" class="text-red-400 font-bold hover:text-red-300 transition">X</button>
            </li>`;
    });
    // Muestra u oculta el botón de iniciar si hay menos de 2 jugadores
    if (players.length >= 2) {
        startGameBtn.classList.remove('hidden');
    } else {
        startGameBtn.classList.add('hidden');
    }
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

// --- 6. LÓGICA DEL JUEGO ---
function showGameScreen() {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
}

function renderRanking() {
    // Clonamos para ordenar de mayor a menor puntaje
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    rankingList.innerHTML = '';
    sortedPlayers.forEach((p, index) => {
        rankingList.innerHTML += `
            <li class='flex justify-between items-center bg-gray-700 p-3 rounded-lg border-l-4 ${index === 0 ? 'border-yellow-400' : 'border-blue-500'}'>
                <span class="font-bold text-lg truncate pr-2">${index + 1}. ${p.name}</span> 
                <span class="bg-gray-900 px-3 py-1 rounded text-green-400 font-mono text-xl whitespace-nowrap">${p.score} pts</span>
            </li>`;
    });
}

function loadVideo() {
    if (currentVideoIndex >= videosDB.length) {
        alert("¡No hay más videos! Fin del juego.");
        return;
    }
    const currentVideo = videosDB[currentVideoIndex];
    const videoId = extractYouTubeID(currentVideo.youtube_id_recortado);
    
    // Genera la URL limpia
    const newSrc = `https://www.youtube.com/embed/${videoId}?rel=0`;
    if(youtubePlayer.src !== newSrc) youtubePlayer.src = newSrc;
    
    videoInfo.innerText = `Ronda ${currentVideoIndex + 1}: ${currentVideo.partido}`;
    
    // Oculta el botón de revelar gol al inicio de la ronda
    revealVideoBtn.classList.add('hidden');
}

document.getElementById('next-video-btn').addEventListener('click', () => {
    if (currentVideoIndex < videosDB.length - 1) {
        currentVideoIndex++;
        saveState();
        loadVideo();
    } else {
        alert("¡Ya estás en el último video de la lista!");
    }
});

// --- 7. PANEL DE PUNTUACIÓN ---
document.getElementById('open-modal-btn').addEventListener('click', () => {
    const currentVideo = videosDB[currentVideoIndex];
    modalAnswerKey.innerHTML = `<strong>Goleador:</strong> ${currentVideo.goleador} <br> <strong>Resultado:</strong> ${currentVideo.resultado}`;
    
    modalPlayersList.innerHTML = '';
    players.forEach((p, index) => {
        modalPlayersList.innerHTML += `
            <div class='flex justify-between items-center bg-gray-700 p-3 rounded'>
                <span class="font-bold w-1/3 truncate" title="${p.name}">${p.name}</span>
                <div class="flex gap-4 w-2/3 justify-end">
                    <label class="flex items-center gap-1 cursor-pointer select-none">
                        <input type="checkbox" id="goleador-${index}" class="w-5 h-5 accent-blue-500">
                        <span class="text-sm">Gol (+1)</span>
                    </label>
                    <label class="flex items-center gap-1 cursor-pointer select-none">
                        <input type="checkbox" id="marcador-${index}" class="w-5 h-5 accent-blue-500">
                        <span class="text-sm">Marcador (+2)</span>
                    </label>
                </div>
            </div>`;
    });
    scoreModal.classList.remove('hidden');
});

document.getElementById('close-modal-btn').addEventListener('click', () => scoreModal.classList.add('hidden'));

document.getElementById('save-scores-btn').addEventListener('click', () => {
    players.forEach((p, index) => {
        // Verificamos que los checkbox existan antes de leerlos para evitar errores
        const golCb = document.getElementById(`goleador-${index}`);
        const marCb = document.getElementById(`marcador-${index}`);
        
        if (golCb && golCb.checked) p.score += 1;
        if (marCb && marCb.checked) p.score += 2;
    });
    
    saveState();
    renderRanking();
    scoreModal.classList.add('hidden');
    
    // Mostrar el botón para revelar el gol completo
    revealVideoBtn.classList.remove('hidden');
});

// --- 8. REVELAR GOL COMPLETO ---
revealVideoBtn.addEventListener('click', () => {
    const currentVideo = videosDB[currentVideoIndex];
    const videoIdCompleto = extractYouTubeID(currentVideo.youtube_id_completo);
    
    youtubePlayer.src = `https://www.youtube.com/embed/${videoIdCompleto}?rel=0&autoplay=1`;
    revealVideoBtn.classList.add('hidden');
});

// --- 9. GUARDADO Y RESETEO ---
function saveState() {
    localStorage.setItem('trivia_players', JSON.stringify(players));
    localStorage.setItem('trivia_video_index', currentVideoIndex);
    localStorage.setItem('trivia_active', isGameActive);
}

document.getElementById('reset-game-btn').addEventListener('click', () => {
    if(confirm('¿Seguro que quieres borrar la partida actual y empezar de cero?')) {
        localStorage.clear();
        location.reload();
    }
});

// Arrancar la magia
init();