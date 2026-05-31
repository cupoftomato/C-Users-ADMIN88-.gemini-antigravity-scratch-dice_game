// --- GLOBAL STATE & UTILITIES ---
let currentUser = null;
let currentToken = null;
let globalPoints = parseInt(localStorage.getItem('poker_chips')) !== null && !isNaN(parseInt(localStorage.getItem('poker_chips'))) ? parseInt(localStorage.getItem('poker_chips')) : 100;
let globalSavings = parseInt(localStorage.getItem('poker_savings')) || 0;
let globalWinStreak = parseInt(localStorage.getItem('poker_win_streak')) || 0;
let globalLoseStreak = parseInt(localStorage.getItem('poker_lose_streak')) || 0;
let activeGame = 'dice'; // 'dice', 'blackjack', 'poker'
let allSumsData = []; // Chart history (Dice specific, but could be shared)
let pointColors = [];
let chartInstance = null;
let ytBgPlayer = null;
let isBgYtReady = false;
let ytJackpotPlayer = null;
let isJackpotYtReady = false;
let isJackpotPlaying = false;

// Audio levels (defaults to 0.3 for music, 0.8 for sfx)
window.musicVolume = localStorage.getItem('poker_music_volume') !== null ? parseFloat(localStorage.getItem('poker_music_volume')) : 0.3;
window.sfxVolume = parseFloat(localStorage.getItem('poker_sfx_volume')) || 0.8;

let notesInterval = null;

// Playtime Reward State
let playTimeSeconds = parseInt(localStorage.getItem('poker_play_time_seconds')) || 0;
let playTimeLevel = parseInt(localStorage.getItem('poker_play_time_level')) || 0;
const rewardMilestones = [
    { name: "5 Min", time: 300, chips: 50 },
];
if (playTimeLevel >= rewardMilestones.length) {
    playTimeLevel = 0;
    localStorage.setItem('poker_play_time_level', 0);
}

// Thrifty Delayed Reveal Payout State
window.isThriftyBetActive = false;
window.pendingChipsUpdate = null;

function spawnMusicNote() {
    const container = document.getElementById('music-notes-container');
    if (!container) return;
    
    const note = document.createElement('div');
    note.className = 'music-note';
    const notes = ['🎵', '🎶', '𝄞', '♪', '♫'];
    note.textContent = notes[Math.floor(Math.random() * notes.length)];
    
    // Spawn left or right side (avoid middle)
    let leftPos = Math.random() * 100;
    if (leftPos > 30 && leftPos < 70) {
        leftPos = leftPos < 50 ? Math.random() * 25 : 75 + Math.random() * 25;
    }
    
    note.style.left = `${leftPos}%`;
    note.style.top = `${15 + Math.random() * 70}%`;
    note.style.fontSize = `${2 + Math.random() * 3}rem`;
    note.style.animationDuration = `${1.5 + Math.random() * 1.5}s`;
    
    container.appendChild(note);
    
    setTimeout(() => {
        if (note.parentNode) note.remove();
    }, 3000);
}

function playJackpotTheme() {
    const audio = document.getElementById('hakari-audio');
    const fireBg = document.getElementById('jackpot-fire-bg');
    
    if (audio) {
        audio.pause(); // Pause local theme music first
    }
    
    isJackpotPlaying = true;
    
    // Pause background music player
    if (isBgYtReady && ytBgPlayer) {
        try {
            ytBgPlayer.pauseVideo();
        } catch (err) {
            console.error("Error pausing background music:", err);
        }
    }
    
    // Play YouTube video starting at 45 seconds
    if (isJackpotYtReady && ytJackpotPlayer) {
        try {
            ytJackpotPlayer.setVolume(window.musicVolume * 100);
            ytJackpotPlayer.seekTo(45, true);
            ytJackpotPlayer.playVideo();
        } catch (err) {
            console.error("YouTube play error, falling back to local:", err);
            if (audio) {
                audio.volume = window.musicVolume * 0.8;
                audio.currentTime = 46;
                audio.play().catch(e => console.error("Audio playback blocked:", e));
            }
        }
    } else if (audio) {
        audio.volume = window.musicVolume * 0.8;
        audio.currentTime = 46;
        audio.play().catch(e => console.error("Audio playback blocked:", e));
    }
    
    if (fireBg) {
        fireBg.classList.add('active');
    }
    
    if (!notesInterval) {
        notesInterval = setInterval(spawnMusicNote, 300);
    }
}

function stopJackpotTheme() {
    const audio = document.getElementById('hakari-audio');
    const fireBg = document.getElementById('jackpot-fire-bg');
    
    if (audio) {
        audio.pause();
    }
    
    isJackpotPlaying = false;
    
    if (ytJackpotPlayer && typeof ytJackpotPlayer.pauseVideo === 'function') {
        try {
            ytJackpotPlayer.pauseVideo();
        } catch (err) {
            console.error("YouTube pause error:", err);
        }
    }
    
    // Resume background music player
    if (isBgYtReady && ytBgPlayer) {
        try {
            ytBgPlayer.setVolume(window.musicVolume * 100);
            ytBgPlayer.playVideo();
        } catch (err) {
            console.error("Error resuming background music:", err);
        }
    }
    
    if (fireBg) {
        fireBg.classList.remove('active');
    }
    
    if (notesInterval) {
        clearInterval(notesInterval);
        notesInterval = null;
    }
    document.getElementById('music-notes-container').innerHTML = '';
}

function updateGlobalStats() {
    document.getElementById('global-points').textContent = globalPoints;
    document.getElementById('global-win-streak').textContent = globalWinStreak;
    document.getElementById('global-lose-streak').textContent = globalLoseStreak;
    
    // Persist to localStorage to save stats on refresh
    localStorage.setItem('poker_chips', globalPoints);
    localStorage.setItem('poker_win_streak', globalWinStreak);
    localStorage.setItem('poker_lose_streak', globalLoseStreak);
    
    if (typeof currentUser !== 'undefined' && currentUser) {
        sessionStorage.setItem('poker_username', currentUser);
        sessionStorage.setItem('poker_chips', globalPoints);
        if (typeof currentToken !== 'undefined') {
            sessionStorage.setItem('poker_token', currentToken);
        }
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('admin_set_chips', { username: currentUser, chips: globalPoints });
        }
    }
}

function switchGame(game) {
    activeGame = game;
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${game}`).classList.add('active');
    
    document.querySelectorAll('.game-view').forEach(view => view.classList.remove('active-view'));
    document.getElementById(`view-${game}`).classList.add('active-view');
    
    // Ensure persistent stats are visible when playing
    const persistentStats = document.getElementById('persistent-stats');
    if (persistentStats) {
        persistentStats.style.display = 'flex';
    }
    
    if (game === 'dice') {
        moveBetLogWidget('thrifty-chat-slot');
        joinChatChannel('Thrifty');
    } else if (game === 'blackjack') {
        moveBetLogWidget('blackjack-chat-slot');
        joinChatChannel('Blackjack');
    } else if (game === 'poker') {
        moveBetLogWidget(null);
        joinChatChannel('Poker');
    } else if (game === 'roulette') {
        moveBetLogWidget('roulette-chat-slot');
        joinChatChannel('Roulette');
        if (typeof initRouletteGame === 'function') initRouletteGame();
    } else if (game === 'slots') {
        moveBetLogWidget(null);
        joinChatChannel('Slots');
        if (typeof initSlotsGame === 'function') initSlotsGame();
    } else {
        moveBetLogWidget(null); // hide
    }
}

function triggerGoldenCelebration() {
    if (typeof confetti === 'undefined') {
        console.warn("confetti not loaded. Skipping particle animation.");
        return;
    }
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000, colors: ['#fbbf24', '#f59e0b', '#ffffff'] };

    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);

        const particleCount = 50 * (timeLeft / duration);
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);
}

function processGameResult(won, betAmount, winMultiplier, subtitleElementId, resetBtnId, isMultiplayer = false) {
    if (won) {
        document.getElementById('bg-flash').className = 'bg-flash won';
        
        let winnings = betAmount * winMultiplier;
        let streakMessage = "";
        
        globalWinStreak++;
        globalLoseStreak = 0;
        
        if (globalWinStreak === 3) {
            playJackpotTheme();
        }
        
        if (globalWinStreak >= 5) {
            winnings = winnings * 2;
            streakMessage = "<br><span style='color:#fbbf24; font-size:1.1rem; text-shadow: 0 0 10px rgba(251,191,36,0.5);'>🔥 STREAK BONUS: x2 WINNINGS! 🔥</span>";
            if (globalWinStreak === 5) {
                triggerGoldenCelebration();
            }
        }

        const earningsMult = 1 + (globalSavings / 10000) * 0.005;
        let bankMessage = "";
        if (!isMultiplayer) {
            const originalWinnings = winnings;
            winnings = Math.round(winnings * earningsMult);
            const bankBonus = winnings - originalWinnings;
            if (bankBonus > 0) {
                const bonusPercent = ((globalSavings / 10000) * 0.5).toFixed(2);
                bankMessage = `<br><span style='color:#34d399; font-size:0.95rem; font-weight:bold; text-shadow: 0 0 8px rgba(52,211,153,0.3);'>💰 Bank Multiplier Bonus (+${bonusPercent}%): +${bankBonus} chips!</span>`;
            }
            globalPoints += winnings;
        } else {
            if (earningsMult > 1) {
                const bonusPercent = ((globalSavings / 10000) * 0.5).toFixed(2);
                bankMessage = `<br><span style='color:#34d399; font-size:0.95rem; font-weight:bold; text-shadow: 0 0 8px rgba(52,211,153,0.3);'>💰 Bank Multiplier Bonus (+${bonusPercent}%) active!</span>`;
            }
        }
        document.getElementById(subtitleElementId).innerHTML = `You won ${winnings} chips!${streakMessage}${bankMessage}`;
    } else {
        document.getElementById('bg-flash').className = 'bg-flash lost';
        
        globalWinStreak = 0;
        globalLoseStreak++;
        stopJackpotTheme();
        
        let pityPoints = 0;
        if (globalLoseStreak >= 6) pityPoints = 3;
        else if (globalLoseStreak >= 5) pityPoints = 2;
        else if (globalLoseStreak >= 3) pityPoints = 1;
        
        if (pityPoints > 0) {
            if (!isMultiplayer) {
                globalPoints += pityPoints;
            }
            document.getElementById(subtitleElementId).innerHTML = `You lost ${betAmount} chips.<br><span style="color:#fbbf24; font-size:1.1rem; text-shadow: 0 0 10px rgba(251,191,36,0.5);">Pity Bonus: +${pityPoints} chip(s)!</span>`;
        } else {
            document.getElementById(subtitleElementId).textContent = `You lost ${betAmount} chips.`;
        }
    }
    
    updateGlobalStats();
    
    if (!isMultiplayer && globalPoints <= 0) {
        document.getElementById(subtitleElementId).innerHTML += "<br><strong style='color:#cbd5e1;'>You have 0 chips. You can continue playing with 0-chip bets!</strong>";
    } else {
        const resetBtn = document.getElementById(resetBtnId);
        if (resetBtn) resetBtn.classList.add('show');
    }
}

function triggerDealerAnimation(botId) {
    const bot = document.getElementById(botId);
    if (bot) {
        bot.classList.remove('dealing');
        void bot.offsetWidth;
        bot.classList.add('dealing');
    }
}

// --- DICE GAME LOGIC ---
let diceValues = [];
let revealedCount = 0;
let isClickableDice = false;
let currentBetAmountDice = 0;
let currentBetTypeDice = '';

function initChart() {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js not loaded. Disabling history chart.");
        return;
    }
    const ctx = document.getElementById('historyChart').getContext('2d');
    Chart.defaults.color = '#f8fafc';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'History',
                    data: allSumsData,
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    pointBackgroundColor: pointColors,
                    pointBorderColor: '#fff',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    borderWidth: 3,
                    tension: 0.3
                },
                { label: 'Thrift', data: [], borderColor: 'transparent', pointBackgroundColor: '#34d399', pointBorderColor: '#fff', pointRadius: 6 },
                { label: 'Xyric', data: [], borderColor: 'transparent', pointBackgroundColor: '#f87171', pointBorderColor: '#fff', pointRadius: 6 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'History of Sums', font: { size: 20, weight: 'bold' }, color: '#f8fafc' },
                legend: { position: 'top', labels: { font: { size: 14 }, filter: function(item) { return item.text !== 'History'; } } }
            },
            scales: {
                y: {
                    min: 2, max: 19,
                    grid: { color: (context) => context.tick && context.tick.value === 10 ? 'rgba(251, 191, 36, 0.8)' : 'rgba(255, 255, 255, 0.1)', lineWidth: (context) => context.tick && context.tick.value === 10 ? 2 : 1 },
                    title: { display: true, text: 'Dice Sum' }
                },
                x: { grid: { color: 'rgba(255, 255, 255, 0.1)' }, title: { display: true, text: 'Occurrence Number' } }
            }
        }
    });
}

function updateChart() {
    if (!chartInstance) return;
    if (allSumsData.length > 10) {
        allSumsData.shift();
        pointColors.shift();
    }
    const newLabels = [];
    for (let i = 1; i <= allSumsData.length; i++) newLabels.push('#' + i);
    chartInstance.data.labels = newLabels;
    chartInstance.update();
}

let socket = null;

function appendChatMessageToDOM(data) {
    const msgContainer = document.getElementById('chat-messages');
    if (!msgContainer) return;
    
    const div = document.createElement('div');
    div.className = 'chat-msg';
    
    const timeStr = new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    div.innerHTML = `<span class="chat-msg-time">[${timeStr}]</span> <span class="chat-msg-user">${data.username}:</span> <span class="chat-msg-content">${data.message}</span>`;
    
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

function appendBetLogToDOM(data) {
    const betLogContainer = document.getElementById('bet-log-messages');
    if (!betLogContainer) return;
    
    const div = document.createElement('div');
    div.className = 'chat-msg';
    
    const timeStr = new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    div.innerHTML = `<span class="chat-msg-time">[${timeStr}]</span> <span class="chat-msg-content" style="color: #60a5fa; font-weight: bold;">${data.message}</span>`;
    
    betLogContainer.appendChild(div);
    betLogContainer.scrollTop = betLogContainer.scrollHeight;
}

function connectMultiplayerServer() {
    if (socket) return;
    if (typeof io === 'undefined') {
        console.warn("Socket.io is not loaded. Multiplayer features will be disabled.");
        return;
    }
    
    // In a real app, pass the token for authentication
    const serverUrl = window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:3000';
    socket = io(serverUrl);
    
    socket.on('connect', () => {
        console.log("Connected to Casino Server!");
        
        let targetChannel = 'Global';
        if (activeGame === 'dice') targetChannel = 'Thrifty';
        else if (activeGame === 'blackjack') targetChannel = 'Blackjack';
        else if (activeGame === 'poker') targetChannel = 'Poker';
        else if (activeGame === 'roulette') targetChannel = 'Roulette';
        else if (activeGame === 'slots') targetChannel = 'Slots';
        
        joinChatChannel(targetChannel, true);
        registerSocketUser();
    });

    socket.on('chips_updated', (data) => {
        if (typeof currentUser !== 'undefined' && currentUser && data.username === currentUser) {
            if (activeGame === 'dice' && window.isThriftyBetActive) {
                window.pendingChipsUpdate = data.chips;
            } else {
                globalPoints = data.chips;
                updateGlobalStats();
            }
        }
    });

    socket.on('sync_savings_data', (data) => {
        globalSavings = data.savings;
        globalPoints = data.chips;
        localStorage.setItem('poker_savings', globalSavings);
        updateSavingsUI();
        updateGlobalStats();
    });

    socket.on('savings_error', (msg) => {
        alert("Savings Bank Error: " + msg);
    });

    socket.on('admin_secret_dice', (dice) => {
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.toLowerCase() === 'cupoftomato') {
            diceValues = dice;
            // Let the admin click and reveal dice even in betting phase!
            const diceContainer = document.getElementById('dice-container');
            if (diceContainer) {
                diceContainer.style.opacity = '1';
                diceContainer.style.pointerEvents = 'auto';
            }
            isClickableDice = true;
            
            // Set the faces inside the dice so they show when folders are clicked
            for (let i = 1; i <= 3; i++) {
                const dieEl = document.getElementById(`die-${i}`);
                if (dieEl) dieEl.textContent = getDiceFace(diceValues[i-1]);
            }
        }
    });
    
    socket.on('global_chat_history', (history) => {
        const msgContainer = document.getElementById('chat-messages');
        if (msgContainer) {
            msgContainer.innerHTML = '';
            history.forEach(data => {
                appendChatMessageToDOM(data);
            });
        }
    });

    socket.on('chat_message_receive', (data) => {
        const msgChannel = data.channel || activeChatChannel || 'Global';
        const isBetLog = data.message && data.message.startsWith('🤖');
        
        if (isBetLog) {
            if (!window.betLogHistory) {
                window.betLogHistory = {};
            }
            if (!window.betLogHistory[msgChannel]) {
                window.betLogHistory[msgChannel] = [];
            }
            window.betLogHistory[msgChannel].push(data);
            if (window.betLogHistory[msgChannel].length > 100) {
                window.betLogHistory[msgChannel].shift();
            }
            if (msgChannel === activeChatChannel) {
                appendBetLogToDOM(data);
            }
        } else {
            if (!window.chatChannelHistory) {
                window.chatChannelHistory = {};
            }
            if (!window.chatChannelHistory['Global']) {
                window.chatChannelHistory['Global'] = [];
            }
            window.chatChannelHistory['Global'].push(data);
            if (window.chatChannelHistory['Global'].length > 100) {
                window.chatChannelHistory['Global'].shift();
            }
            appendChatMessageToDOM(data);
            
            // Show unread dot if chat is closed and the message is not from currentUser
            const widget = document.getElementById('global-chat-widget');
            const isClosed = !widget || widget.style.display === 'none';
            const isMe = currentUser && data.username === currentUser;
            if (isClosed && !isMe) {
                const dot = document.getElementById('chat-unread-dot');
                if (dot) dot.style.display = 'block';
            }
        }
    });


    
    // --- POKER ROOM SYNC ---
    socket.on('room_created', (data) => {
        currentRoomCode = data.code;
        isRoomHost = true;
        updateWaitingRoomUI(data.code, data.room);
        showLobbyView('waiting-room-view');
    });

    socket.on('room_joined', (data) => {
        currentRoomCode = data.code;
        isRoomHost = false;
        updateWaitingRoomUI(data.code, data.room);
        showLobbyView('waiting-room-view');
    });

    socket.on('room_update', (room) => {
        updateWaitingRoomUI(currentRoomCode, room);
    });

    socket.on('room_error', (msg) => {
        const errHost = document.getElementById('multiplayer-error');
        if (errHost) errHost.textContent = msg;
        alert(msg);
    });

    socket.on('room_destroyed', (msg) => {
        alert(msg);
        currentRoomCode = null;
        isRoomHost = false;
        showLobbyView('multiplayer-select-view');
        moveBetLogWidget('poker-chat-slot');
        
        // Hide game if it was active
        document.getElementById('poker-room').style.display = 'none';
        document.getElementById('waiting-room-view').style.display = 'none';
    });

    socket.on('poker_state_update', (state) => {
        if (typeof updateMultiplayerPokerUI === 'function') {
            updateMultiplayerPokerUI(state);
        }
    });

    socket.on('rooms_list_update', (rooms) => {
        if (typeof updateMultiplayerRoomsUI === 'function') {
            updateMultiplayerRoomsUI(rooms);
        }
    });

    // --- THRIFTY SYNC ---
    socket.on('thrifty_sync', (state) => {
        updateThriftyState(state.phase, state.timeLeft);
        if (state.phase === 'reveal') {
            diceValues = state.dice;
        }
        if (state.history && state.history.length > 0) {
            allSumsData.length = 0;
            allSumsData.push(...state.history);
            pointColors.length = 0;
            pointColors.push(...allSumsData.map(sum => sum >= 11 ? '#34d399' : '#f87171'));
            updateChart();
        }
    });

    socket.on('thrifty_tick', (state) => {
        updateThriftyState(state.phase, state.timeLeft);
        if (state.pot !== undefined) {
            const potEl = document.getElementById('thrifty-pot');
            if (potEl) potEl.textContent = state.pot;
        }
    });

    socket.on('thrifty_start_betting', (timeLeft) => {
        updateThriftyState('betting', timeLeft);
        resetThriftyUI();
    });

    socket.on('thrifty_reveal', (dice) => {
        diceValues = dice;
        updateThriftyState('reveal', 25);
        
        // Show and unlock dice container
        const diceContainer = document.getElementById('dice-container');
        if (diceContainer) {
            diceContainer.style.opacity = '1';
            diceContainer.style.pointerEvents = 'auto';
        }
        isClickableDice = true;
        document.getElementById('skip-reveal-btn').style.display = 'inline-block';
        
        // Set dice faces
        for (let i = 1; i <= 3; i++) {
            const dieEl = document.getElementById(`die-${i}`);
            if (dieEl) dieEl.textContent = getDiceFace(diceValues[i-1]);
        }

        // Global dice chart tracking: Track every server-rolled round
        const sum = dice.reduce((a, b) => a + b, 0);
        allSumsData.push(sum);
        pointColors.push(sum >= 11 ? '#34d399' : '#f87171');
        updateChart();
    });

    socket.on('online_players_data', (players) => {
        const listContainer = document.getElementById('player-tab-list');
        if (!listContainer) return;
        
        if (players.length === 0) {
            listContainer.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 20px;">No other online players</div>';
            return;
        }
        
        // Sort by total money descending
        players.sort((a, b) => (b.chips + b.savings) - (a.chips + a.savings));
        
        listContainer.innerHTML = players.map(p => {
            const isMe = p.username === currentUser;
            const total = p.chips + p.savings;
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; background: ${isMe ? 'rgba(59, 130, 246, 0.15)' : 'rgba(0,0,0,0.3)'}; border-radius: 10px; border: 1px solid ${isMe ? '#3b82f6' : 'rgba(255,255,255,0.05)'};">
                    <span style="font-weight: bold; color: ${isMe ? '#38bdf8' : '#cbd5e1'};">${p.username} ${isMe ? '(You)' : ''}</span>
                    <span style="color: #fbbf24; font-weight: bold; font-size: 1.05rem;">${total} <span style="font-size: 0.85rem; color: #94a3b8; font-weight: normal;">(${p.chips} + ${p.savings} Bank)</span></span>
                </div>
            `;
        }).join('');
    });

    socket.on('transfer_success', (data) => {
        alert(`Successfully transferred ${data.amount} chips to ${data.recipient}!`);
        globalPoints = data.senderChips;
        updateGlobalStats();
    });

    socket.on('transfer_error', (msg) => {
        alert("Transfer failed: " + msg);
    });
}

function updateThriftyState(phase, timeLeft) {
    document.getElementById('thrifty-timer').textContent = timeLeft;
    const sub = document.getElementById('subtitle-dice');
    
    if (phase === 'betting') {
        if (!currentBetTypeDice) {
            sub.textContent = 'Place your bet before time runs out!';
            document.getElementById('bet-amount-dice').disabled = false;
            document.getElementById('bet-thrift').disabled = false;
            document.getElementById('bet-xyric').disabled = false;
        } else {
            sub.textContent = `Waiting for others... (${currentBetAmountDice} on ${currentBetTypeDice})`;
        }
    } else if (phase === 'reveal') {
        sub.textContent = 'Reveal Phase! Unfold the dice!';
        document.getElementById('bet-amount-dice').disabled = true;
        document.getElementById('bet-thrift').disabled = true;
        document.getElementById('bet-xyric').disabled = true;
    }
}

function resetThriftyUI() {
    // If there is an unresolved bet from the last round, resolve it now (safety fallback)
    if (currentBetTypeDice && diceValues.length === 3) {
        checkResultDice();
    }
    currentBetAmountDice = 0;
    currentBetTypeDice = '';
    revealedCount = 0;
    isClickableDice = false;
    document.getElementById('skip-reveal-btn').style.display = 'none';
    
    const resultElement = document.getElementById('result-dice');
    resultElement.className = 'result';
    resultElement.textContent = '';
    document.getElementById('bg-flash').className = 'bg-flash';
    
    const diceContainer = document.getElementById('dice-container');
    if (diceContainer) {
        diceContainer.style.opacity = '0.5';
        diceContainer.style.pointerEvents = 'none';
    }

    // Reset Cover Circle
    const circle = document.getElementById('dice-cover-circle');
    if (circle) {
        circle.style.display = 'flex';
        circle.style.transform = 'translate(-50%, -50%)';
        circle.style.opacity = '1';
        circle.style.transition = 'none';
    }

    // Auto turn off admin reveal on next round
    adminRevealActive = false;
    const statusEl = document.getElementById('thrifty-reveal-status');
    if (statusEl) {
        statusEl.textContent = 'OFF';
        statusEl.style.color = '#ef4444';
    }
    
    for (let i = 1; i <= 3; i++) {
        const dieEl = document.getElementById(`die-${i}`);
        if (dieEl) dieEl.textContent = '';
    }
}

function initDiceGame(isFirstLoad = false) {
    const resetBtn = document.getElementById('reset-btn-dice');
    if (resetBtn) resetBtn.classList.remove('show');
    if (isFirstLoad) {
        connectMultiplayerServer();
    }
}

function getDiceFace(num) {
    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return faces[num - 1] || num;
}

function placeBetDice(type) {
    if (!socket || !currentUser) {
        alert("You must be logged in to play Multiplayer Thrifty!");
        return;
    }
    
    const amount = parseInt(document.getElementById('bet-amount-dice').value);
    if (globalPoints === 0) {
        if (amount !== 0) return alert("You have 0 chips. You can only place a bet of 0!");
    } else {
        if (isNaN(amount) || amount <= 0) return alert("Please enter a valid bet amount.");
        if (amount > globalPoints) return alert("You don't have enough chips!");
    }
    
    currentBetAmountDice = amount;
    currentBetTypeDice = type;
    globalPoints -= amount;
    updateGlobalStats();
    
    document.getElementById('bet-amount-dice').disabled = true;
    document.getElementById('bet-thrift').disabled = true;
    document.getElementById('bet-xyric').disabled = true;
    
    socket.emit('place_thrifty_bet', { username: currentUser, type: type, amount: amount, streak: globalWinStreak });
    window.isThriftyBetActive = true;
    window.pendingChipsUpdate = null;
}

function skipThriftyReveal() {
    if (!isClickableDice) return;
    dragX = 0;
    dragY = -250; // Fly upwards
    triggerRevealByDrag();
}

function finishReveal() {
    isClickableDice = false;
    document.getElementById('skip-reveal-btn').style.display = 'none';
    setTimeout(checkResultDice, 600);
}

function checkResultDice() {
    if (diceValues.length !== 3) return;
    const sum = diceValues.reduce((a, b) => a + b, 0);
    const resultElement = document.getElementById('result-dice');
    resultElement.classList.add('show');
    
    const isThrift = sum >= 11;
    if (isThrift) {
        resultElement.textContent = `THRIFT (${sum})`;
        resultElement.classList.add('thrift');
    } else {
        resultElement.textContent = `XYRIC (${sum})`;
        resultElement.classList.add('xyric');
    }
    
    if (currentBetTypeDice) {
        let won = (isThrift && currentBetTypeDice === 'thrift') || (!isThrift && currentBetTypeDice === 'xyric');
        processGameResult(won, currentBetAmountDice, 2, 'subtitle-dice', 'reset-btn-dice', true);
    }
    
    window.isThriftyBetActive = false;
    if (window.pendingChipsUpdate !== null) {
        globalPoints = window.pendingChipsUpdate;
        window.pendingChipsUpdate = null;
        updateGlobalStats();
    }
}

// Initial Boot
window.onload = () => {
    const savedUser = sessionStorage.getItem('poker_username');
    const savedToken = sessionStorage.getItem('poker_token');
    if (savedUser && savedToken) {
        currentUser = savedUser;
        currentToken = savedToken;
        globalPoints = parseInt(sessionStorage.getItem('poker_chips')) || 1000;
        globalSavings = parseInt(localStorage.getItem('poker_savings')) || 0;
        if (typeof updateSavingsUI === 'function') {
            updateSavingsUI();
        }
        
        document.getElementById('view-auth').classList.remove('active-view');
        document.getElementById('global-nav').style.display = 'flex';
        switchGame('dice');
        
        if (currentUser.toLowerCase() === 'cupoftomato') {
            document.getElementById('nav-admin-btn').style.display = 'inline-block';
        }
    }

    // Sync volume sliders to stored values
    const musicSlider = document.getElementById('music-volume-slider');
    const sfxSlider = document.getElementById('sfx-volume-slider');
    if (musicSlider) {
        musicSlider.value = Math.round(window.musicVolume * 100);
        document.getElementById('music-vol-val').textContent = `${musicSlider.value}%`;
    }
    if (sfxSlider) {
        sfxSlider.value = Math.round(window.sfxVolume * 100);
        document.getElementById('sfx-vol-val').textContent = `${sfxSlider.value}%`;
    }

    // Load custom cat image if set
    const savedCat = localStorage.getItem('poker_cat_img');
    const catImg = document.getElementById('cat-img');
    if (savedCat && catImg) {
        catImg.src = savedCat;
    }

    updateGlobalStats();
    initChart();
    initDiceGame(true);
    initBlackjackGame(true);
    initPokerGame(true);
    initCoverDrag();
    setupNavHoverPreviews();
    startPlayTimeTimer();

    // Initialize draggable chat widget
    const chatWidget = document.getElementById('global-chat-widget');
    const dragHeader = document.getElementById('chat-drag-header');
    if (chatWidget && dragHeader) {
        makeElementDraggable(chatWidget, dragHeader);
    }
};

// --- CAT FEEDING LOGIC ---
let isFeedingCat = false;

function feedCat() {
    if (isFeedingCat) return;
    
    if (globalPoints < 10) {
        alert("Not enough chips to feed the kitty!");
        return;
    }
    
    globalPoints -= 10;
    updateGlobalStats();
    
    isFeedingCat = true;
    const catImg = document.getElementById('cat-img');
    const eatSound = document.getElementById('cat-eat-sound');
    const feedBtn = document.getElementById('feed-cat-btn');
    const jackpotAudio = document.getElementById('hakari-audio');
    
    feedBtn.disabled = true;
    
    // Audio Ducking: Lower jackpot music volume if it's currently playing
    let duckingAudio = false;
    if (jackpotAudio && !jackpotAudio.paused) {
        jackpotAudio.volume = window.musicVolume * 0.1;
        duckingAudio = true;
    }
    
    // Duck YouTube background music if playing
    let duckingBgMusic = false;
    if (isBgYtReady && ytBgPlayer && typeof ytBgPlayer.setVolume === 'function') {
        try {
            ytBgPlayer.setVolume(window.musicVolume * 10);
            duckingBgMusic = true;
        } catch (e) {}
    }
    
    eatSound.currentTime = 0;
    eatSound.volume = window.sfxVolume;
    eatSound.play().catch(e => console.error("Cat eat sound blocked:", e));
    
    let chewCount = 0;
    const chewInterval = setInterval(() => {
        catImg.src = chewCount % 2 === 0 ? "cat2.png" : "cat1.jpg";
        catImg.style.transform = chewCount % 2 === 0 ? "scale(1.1) translateY(-10px)" : "scale(1) translateY(0)";
        chewCount++;
        
        // Let it chew for 10 frames (approx 2.5 seconds at 250ms per frame)
        if (chewCount > 10) {
            clearInterval(chewInterval);
            
            // Done eating, show lip licking image
            catImg.src = "cat3.jpg";
            catImg.style.transform = "scale(1)";
            
            // Revert to normal after 3 seconds
            setTimeout(() => {
                catImg.src = localStorage.getItem('poker_cat_img') || "cat1.jpg";
                isFeedingCat = false;
                feedBtn.disabled = false;
                
                // Restore jackpot music volume
                if (duckingAudio && jackpotAudio && !jackpotAudio.paused) {
                    jackpotAudio.volume = window.musicVolume * 0.8;
                }
                
                // Restore YouTube background music volume
                if (duckingBgMusic && isBgYtReady && ytBgPlayer && typeof ytBgPlayer.setVolume === 'function') {
                    try {
                        ytBgPlayer.setVolume(window.musicVolume * 100);
                    } catch (e) {}
                }
            }, 3000);
        }
    }, 250);
}

// --- ADMIN PANEL LOGIC ---
function openAdminModal() {
    document.getElementById('admin-modal').style.display = 'flex';
    document.getElementById('admin-login').style.display = 'block';
    document.getElementById('admin-controls').style.display = 'none';
    const pmView = document.getElementById('admin-pm-view');
    const advView = document.getElementById('admin-advance-view');
    if (pmView) pmView.style.display = 'none';
    if (advView) advView.style.display = 'none';
    const pwdEl = document.getElementById('admin-pwd');
    if (pwdEl) pwdEl.value = '';
}

function closeAdminModal() {
    document.getElementById('admin-modal').style.display = 'none';
}

function loginAdmin() {
    document.getElementById('admin-login').style.display = 'none';
    showAdminSubView('main');
    document.getElementById('admin-chips').value = globalPoints;
    document.getElementById('admin-streak').value = globalWinStreak;
}

function applyAdmin() {
    const newChips = parseInt(document.getElementById('admin-chips').value);
    const newStreak = parseInt(document.getElementById('admin-streak').value);
    
    if (!isNaN(newChips)) {
        globalPoints = newChips;
        if (socket && currentUser) {
            socket.emit('admin_set_chips', { username: currentUser, chips: newChips });
        }
    }
    if (!isNaN(newStreak)) globalWinStreak = newStreak;
    
    updateGlobalStats();
    
    // Check if we hit the Hakari jackpot manually via admin
    if (globalWinStreak >= 3) {
        playJackpotTheme();
    } else {
        stopJackpotTheme();
    }
    
    alert("Admin changes applied successfully!");
    closeAdminModal();
}

function givePlayerChips() {
    const targetUser = document.getElementById('admin-target-user').value.trim();
    const amount = parseInt(document.getElementById('admin-give-amount').value);
    
    if (!targetUser) return alert("Please enter a username.");
    if (isNaN(amount) || amount === 0) return alert("Please enter a valid non-zero amount.");
    
    const serverUrl = window.location.origin.startsWith('http') ? '' : 'http://localhost:3000';
    fetch(serverUrl + '/api/admin/add-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUsername: targetUser, amount: amount })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            alert(data.message);
            document.getElementById('admin-target-user').value = '';
        }
    })
    .catch(err => {
        alert("Server is offline or unreachable.");
    });
}

// --- SCRATCH CARD LOGIC ---
let scratchGridSymbols = [];
let scratchedCount = 0;
let isScratchGameOver = false;
let isScratchingInProgress = false;

function openScratchCard() {
    document.getElementById('scratch-modal').style.display = 'flex';
    initScratchCard();
}

function closeScratchCard() {
    document.getElementById('scratch-modal').style.display = 'none';
}

function initScratchCard() {
    scratchedCount = 0;
    isScratchGameOver = false;
    isScratchingInProgress = false;
    document.getElementById('scratch-result-text').textContent = '';
    document.getElementById('scratch-reset-btn').style.display = 'none';
    
    // Determine outcomes: 30% win chance
    const isWin = Math.random() < 0.3;
    const pool = ['🍒', '🍋', '🍇', '🍀', '🔔', '👑', '💎', '7', '🍅'];
    
    scratchGridSymbols = new Array(9).fill(null);
    
    if (isWin) {
        // Pick a winning symbol
        const winningSym = pool[Math.floor(Math.random() * pool.length)];
        
        // Place 3 instances randomly
        let placed = 0;
        while (placed < 3) {
            const idx = Math.floor(Math.random() * 9);
            if (scratchGridSymbols[idx] === null) {
                scratchGridSymbols[idx] = winningSym;
                placed++;
            }
        }
        
        // Fill the remaining 6 slots with other random symbols ensuring no other triple is formed
        const remainingPool = pool.filter(s => s !== winningSym);
        for (let i = 0; i < 9; i++) {
            if (scratchGridSymbols[i] === null) {
                // Find a symbol that doesn't appear 3 times in the grid yet
                let symbol;
                do {
                    symbol = remainingPool[Math.floor(Math.random() * remainingPool.length)];
                } while (scratchGridSymbols.filter(s => s === symbol).length >= 2);
                scratchGridSymbols[i] = symbol;
            }
        }
    } else {
        // Loss case: ensure no symbol appears 3 or more times
        for (let i = 0; i < 9; i++) {
            let symbol;
            do {
                symbol = pool[Math.floor(Math.random() * pool.length)];
            } while (scratchGridSymbols.filter(s => s === symbol).length >= 2);
            scratchGridSymbols[i] = symbol;
        }
    }
    
    // Build HTML grid
    const gridContainer = document.getElementById('scratch-grid');
    if (gridContainer) {
        gridContainer.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            cell.className = 'scratch-cell';
            cell.innerHTML = `
                <span>${scratchGridSymbols[i]}</span>
                <div class="scratch-cover" id="scratch-cover-${i}" onclick="scratchCell(${i})">?</div>
            `;
            gridContainer.appendChild(cell);
        }
    }
}

function scratchCell(index) {
    if (isScratchGameOver || isScratchingInProgress) return;
    
    const cover = document.getElementById(`scratch-cover-${index}`);
    if (cover && !cover.classList.contains('scratched')) {
        isScratchingInProgress = true;
        cover.classList.add('scratched');
        
        // Play click sound using existing slots mechanical click sound context if possible
        try {
            const audioCtx = window.pokerAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.05 * window.sfxVolume, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.08);
        } catch (err) {}
        
        setTimeout(() => {
            isScratchingInProgress = false;
            scratchedCount++;
            if (scratchedCount === 9) {
                checkScratchResult();
            }
        }, 1500);
    }
}

function checkScratchResult() {
    isScratchGameOver = true;
    
    // Find if any symbol has exactly 3 (or more) instances
    const counts = {};
    let winningSymbol = null;
    scratchGridSymbols.forEach(sym => {
        counts[sym] = (counts[sym] || 0) + 1;
        if (counts[sym] >= 3) {
            winningSymbol = sym;
        }
    });
    
    const resultText = document.getElementById('scratch-result-text');
    if (resultText) {
        if (winningSymbol) {
            // WINNER!
            resultText.textContent = `🎉 MATCH 3 ${winningSymbol}! YOU WIN 40 CHIPS! 🎉`;
            resultText.style.color = '#34d399';
            
            globalPoints += 40;
            updateGlobalStats();
            
            if (socket && currentUser) {
                socket.emit('admin_set_chips', { username: currentUser, chips: globalPoints });
            }
            
            // Confetti
            triggerGoldenCelebration();
        } else {
            // LOSER
            resultText.textContent = '❌ NO MATCH. TRY AGAIN! ❌';
            resultText.style.color = '#f87171';
        }
    }
    
    const resetBtn = document.getElementById('scratch-reset-btn');
    if (resetBtn) resetBtn.style.display = 'block';
}

// --- CHAT SYSTEM LOGIC ---
let activeChatChannel = null;

function joinChatChannel(channelName, force = false) {
    if (!socket) return;
    if (activeChatChannel === channelName && !force) return;
    
    socket.emit('join_chat_channel', channelName);
    activeChatChannel = channelName;
    
    const betLogLabel = document.getElementById('bet-log-channel-name');
    if (betLogLabel) betLogLabel.textContent = channelName;
    
    const betLogContainer = document.getElementById('bet-log-messages');
    if (betLogContainer) {
        betLogContainer.innerHTML = '';
        if (window.betLogHistory && window.betLogHistory[channelName]) {
            window.betLogHistory[channelName].forEach(data => {
                appendBetLogToDOM(data);
            });
        }
    }
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg || !socket) return;
    
    const user = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : 'Guest_' + Math.floor(Math.random()*1000);
    
    socket.emit('chat_message', {
        channel: 'Global',
        message: msg,
        username: user
    });
    input.value = '';
}

function moveBetLogWidget(targetSlotId) {
    const widget = document.getElementById('global-bet-log-widget');
    if (!targetSlotId) {
        if (widget) widget.style.display = 'none';
        return;
    }
    const slot = document.getElementById(targetSlotId);
    if (widget && slot) {
        slot.appendChild(widget);
        widget.style.display = 'flex';
    }
}

// Floating Chat window visibility controls
function toggleChatWindow() {
    const widget = document.getElementById('global-chat-widget');
    if (widget) {
        const isOpening = widget.style.display === 'none';
        widget.style.display = isOpening ? 'flex' : 'none';
        if (isOpening) {
            const dot = document.getElementById('chat-unread-dot');
            if (dot) dot.style.display = 'none';
        }
    }
}

// Dragging logic for elements
function makeElementDraggable(elmnt, header) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    if (header) {
        header.onmousedown = dragMouseDown;
        header.ontouchstart = dragMouseDown;
    } else {
        elmnt.onmousedown = dragMouseDown;
        elmnt.ontouchstart = dragMouseDown;
    }

    function dragMouseDown(e) {
        e = e || window.event;
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        pos3 = clientX;
        pos4 = clientY;
        
        document.onmouseup = closeDragElement;
        document.ontouchend = closeDragElement;
        document.onmousemove = elementDrag;
        document.ontouchmove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        pos1 = pos3 - clientX;
        pos2 = pos4 - clientY;
        pos3 = clientX;
        pos4 = clientY;
        
        let newTop = elmnt.offsetTop - pos2;
        let newLeft = elmnt.offsetLeft - pos1;
        
        if (newTop < 0) newTop = 0;
        if (newLeft < 0) newLeft = 0;
        if (newTop + elmnt.offsetHeight > window.innerHeight) newTop = window.innerHeight - elmnt.offsetHeight;
        if (newLeft + elmnt.offsetWidth > window.innerWidth) newLeft = window.innerWidth - elmnt.offsetWidth;
        
        elmnt.style.top = newTop + "px";
        elmnt.style.left = newLeft + "px";
        elmnt.style.bottom = "auto";
        elmnt.style.right = "auto";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.ontouchend = null;
        document.onmousemove = null;
        document.ontouchmove = null;
    }
}

function registerSocketUser() {
    if (socket && typeof currentUser !== 'undefined' && currentUser) {
        socket.emit('register_socket_user', currentUser);
    }
}

let isDraggingCover = false;
let startX = 0, startY = 0;
let dragX = 0, dragY = 0;

function initCoverDrag() {
    const circle = document.getElementById('dice-cover-circle');
    if (!circle) return;
    
    const handleStart = (e) => {
        if (!isClickableDice) return;
        isDraggingCover = true;
        circle.style.cursor = 'grabbing';
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startX = clientX;
        startY = clientY;
        circle.style.transition = 'none'; // Disable transition during drag
    };
    
    const handleMove = (e) => {
        if (!isDraggingCover) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        dragX = clientX - startX;
        dragY = clientY - startY;
        
        // Translate from center (-50%, -50%)
        circle.style.transform = `translate(calc(-50% + ${dragX}px), calc(-50% + ${dragY}px))`;
        
        // Check if dragged far enough (270px radius threshold)
        const distance = Math.sqrt(dragX * dragX + dragY * dragY);
        if (distance > 270) {
            triggerRevealByDrag();
        }
    };
    
    const handleEnd = () => {
        if (!isDraggingCover) return;
        isDraggingCover = false;
        circle.style.cursor = 'grab';
        
        // If not revealed, snap back to center
        circle.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        circle.style.transform = 'translate(-50%, -50%)';
    };
    
    circle.addEventListener('mousedown', handleStart);
    circle.addEventListener('touchstart', handleStart);
    
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove, { passive: false });
    
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchend', handleEnd);
}

function triggerRevealByDrag() {
    isDraggingCover = false;
    isClickableDice = false;
    
    const circle = document.getElementById('dice-cover-circle');
    if (circle) {
        circle.style.cursor = 'default';
        circle.style.transition = 'all 0.5s ease-in';
        
        // Animate flying out and disappearing
        circle.style.transform = `translate(calc(-50% + ${dragX * 2.5}px), calc(-50% + ${dragY * 2.5}px)) scale(0.3)`;
        circle.style.opacity = '0';
    }
    
    setTimeout(() => {
        if (circle) circle.style.display = 'none';
        finishReveal();
    }, 500);
}

let adminRevealActive = false;

function showAdminSubView(viewName) {
    const mainView = document.getElementById('admin-controls');
    const pmView = document.getElementById('admin-pm-view');
    const advView = document.getElementById('admin-advance-view');
    
    if (mainView) mainView.style.display = 'none';
    if (pmView) pmView.style.display = 'none';
    if (advView) advView.style.display = 'none';
    
    if (viewName === 'main' && mainView) {
        mainView.style.display = 'flex';
    } else if (viewName === 'player-management' && pmView) {
        pmView.style.display = 'flex';
    } else if (viewName === 'advance' && advView) {
        advView.style.display = 'flex';
    }
}

function toggleThriftyReveal() {
    if (!socket || !currentUser) return;
    
    adminRevealActive = !adminRevealActive;
    
    socket.emit('toggle_thrifty_reveal', { username: currentUser, enabled: adminRevealActive });
    
    const statusEl = document.getElementById('thrifty-reveal-status');
    if (statusEl) {
        statusEl.textContent = adminRevealActive ? 'ON' : 'OFF';
        statusEl.style.color = adminRevealActive ? '#34d399' : '#ef4444';
    }
}

// Autoplay & AudioContext Unlocking Helper
function unlockAudio() {
    // Resume global AudioContext if suspended
    if (typeof pokerAudioCtx !== 'undefined' && pokerAudioCtx && pokerAudioCtx.state === 'suspended') {
        pokerAudioCtx.resume().catch(err => console.log("AudioContext resume error:", err));
    }
    // Pre-trigger play/pause on elements to unlock them for later
    const hakari = document.getElementById('hakari-audio');
    if (hakari && hakari.paused && hakari.currentTime === 0) {
        hakari.play().then(() => hakari.pause()).catch(e => console.log("Unlock failed:", e));
    }
    const catEat = document.getElementById('cat-eat-sound');
    if (catEat && catEat.paused) {
        catEat.play().then(() => catEat.pause()).catch(e => console.log("Unlock failed:", e));
    }
    
    // Unlock and play background music
    if (isBgYtReady && ytBgPlayer && typeof ytBgPlayer.playVideo === 'function') {
        try {
            ytBgPlayer.setVolume(window.musicVolume * 100);
            ytBgPlayer.playVideo();
        } catch (e) {
            console.log("YouTube BG unlock failed:", e);
        }
    }
    
    // Unlock jackpot player
    if (isJackpotYtReady && ytJackpotPlayer && typeof ytJackpotPlayer.playVideo === 'function') {
        try {
            ytJackpotPlayer.playVideo();
            setTimeout(() => {
                try {
                    ytJackpotPlayer.pauseVideo();
                } catch (e) {}
            }, 50);
        } catch (e) {
            console.log("YouTube Jackpot unlock failed:", e);
        }
    }
    
    // Remove listeners once unlocked
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('mousedown', unlockAudio);
}

window.addEventListener('click', unlockAudio);
window.addEventListener('touchstart', unlockAudio);
window.addEventListener('mousedown', unlockAudio);

// YouTube IFrame Player API Callback
function onYouTubeIframeAPIReady() {
    try {
        // Initialize Background Music Player (looping video dGTgBVgRfJI)
        ytBgPlayer = new YT.Player('youtube-bg-player', {
            height: '0',
            width: '0',
            videoId: 'dGTgBVgRfJI',
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'disablekb': 1,
                'fs': 0,
                'rel': 0,
                'showinfo': 0,
                'iv_load_policy': 3,
                'loop': 1,
                'playlist': 'dGTgBVgRfJI'
            },
            events: {
                'onReady': () => {
                    isBgYtReady = true;
                }
            }
        });

        // Initialize Win-streak Jackpot Theme Player (Tuca Donka)
        ytJackpotPlayer = new YT.Player('youtube-jackpot-player', {
            height: '0',
            width: '0',
            videoId: 'bFHW_nL2CO4',
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'disablekb': 1,
                'fs': 0,
                'rel': 0,
                'showinfo': 0,
                'iv_load_policy': 3
            },
            events: {
                'onReady': () => {
                    isJackpotYtReady = true;
                }
            }
        });
    } catch (err) {
        console.error("YouTube API initialization error:", err);
    }
}

// If the YouTube script loaded before script.js was executed, onYouTubeIframeAPIReady won't be fired automatically.
if (window.YT && window.YT.Player) {
    onYouTubeIframeAPIReady();
}

// --- SETTINGS & VOLUME CONTROLS ---
function toggleSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
}

function updateMusicVolume(val) {
    window.musicVolume = parseInt(val) / 100;
    localStorage.setItem('poker_music_volume', window.musicVolume);
    document.getElementById('music-vol-val').textContent = `${val}%`;
    
    // Update active player volumes
    const hakari = document.getElementById('hakari-audio');
    if (hakari) {
        hakari.volume = window.musicVolume * 0.8;
    }
    if (isBgYtReady && ytBgPlayer && typeof ytBgPlayer.setVolume === 'function') {
        try {
            ytBgPlayer.setVolume(window.musicVolume * 100);
        } catch (e) {}
    }
    if (isJackpotYtReady && ytJackpotPlayer && typeof ytJackpotPlayer.setVolume === 'function') {
        try {
            ytJackpotPlayer.setVolume(window.musicVolume * 100);
        } catch (e) {}
    }
}

function updateSFXVolume(val) {
    window.sfxVolume = parseInt(val) / 100;
    localStorage.setItem('poker_sfx_volume', window.sfxVolume);
    document.getElementById('sfx-vol-val').textContent = `${val}%`;
    
    // Update active SFX volumes
    const catEat = document.getElementById('cat-eat-sound');
    if (catEat) {
        catEat.volume = window.sfxVolume;
    }
    if (typeof raiseAudio !== 'undefined') {
        raiseAudio.volume = window.sfxVolume * 0.4;
    }
    if (typeof dealAudio !== 'undefined') {
        dealAudio.volume = window.sfxVolume * 0.6;
    }
}

// --- NAV HOVER PREVIEWS ---
const navPreviews = {
    'nav-dice': { title: 'Thrifty Dice', img: 'thrifty_nav.png' },
    'nav-blackjack': { title: 'Blackjack', img: 'blackjack_nav.png' },
    'nav-poker': { title: 'Texas Hold\'em', img: 'poker_nav.png' },
    'nav-roulette': { title: 'Roulette', img: 'roulette_nav.png' },
    'nav-slots': { title: 'Neon Slots', img: 'slots_nav.png' },
    'nav-ad-btn': { title: 'Lucky Scratch Card', img: 'ads_nav.png' },
    'nav-admin-btn': { title: 'Admin Controls', img: 'admin_nav.png' },
    'nav-settings-btn': { title: 'Audio Settings', img: 'settings_nav.png' }
};

function setupNavHoverPreviews() {
    const previewEl = document.getElementById('nav-hover-preview');
    const titleEl = document.getElementById('nav-preview-title');
    if (!previewEl || !titleEl) return;
    
    Object.keys(navPreviews).forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        
        btn.addEventListener('mouseenter', () => {
            const data = navPreviews[id];
            titleEl.textContent = data.title;
            previewEl.style.backgroundImage = `url('${data.img}')`;
            previewEl.style.backgroundSize = 'cover';
            previewEl.style.backgroundPosition = 'center';
            
            // Position preview card directly below the hovered button
            const rect = btn.getBoundingClientRect();
            const previewWidth = 220;
            const leftPos = rect.left + (rect.width / 2) - (previewWidth / 2);
            
            previewEl.style.left = `${leftPos}px`;
            previewEl.style.display = 'flex';
            
            // Force reflow and animate
            setTimeout(() => {
                previewEl.style.opacity = '1';
                previewEl.style.transform = 'translateY(0) scale(1)';
            }, 10);
        });
        
        btn.addEventListener('mouseleave', () => {
            previewEl.style.opacity = '0';
            previewEl.style.transform = 'translateY(-10px) scale(0.95)';
            setTimeout(() => {
                if (previewEl.style.opacity === '0') {
                    previewEl.style.display = 'none';
                }
            }, 250);
        });
    });
}

function openSavingsModal() {
    updateSavingsUI();
    const modal = document.getElementById('savings-modal');
    if (modal) modal.style.display = 'flex';
}

function toggleSavingsModal() {
    const modal = document.getElementById('savings-modal');
    if (modal) {
        modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
    }
}

function updateSavingsUI() {
    const balEl = document.getElementById('savings-balance-text');
    const multEl = document.getElementById('savings-multiplier-text');
    if (balEl) balEl.textContent = globalSavings;
    if (multEl) {
        const bonusPercent = ((globalSavings / 10000) * 0.5).toFixed(2);
        multEl.textContent = `+${bonusPercent}%`;
    }
}

function depositSavings() {
    const amountInput = document.getElementById('savings-amount-input');
    const amount = parseInt(amountInput.value);
    if (isNaN(amount) || amount <= 0) return alert("Please enter a valid amount of chips.");
    
    if (socket && currentUser) {
        // Send to server
        socket.emit('deposit_savings', { username: currentUser, amount: amount });
    } else {
        // Local offline mode
        if (globalPoints < amount) return alert("Not enough chips to deposit!");
        globalPoints -= amount;
        globalSavings += amount;
        localStorage.setItem('poker_savings', globalSavings);
        updateSavingsUI();
        updateGlobalStats();
    }
    amountInput.value = '';
}

function withdrawSavings() {
    const amountInput = document.getElementById('savings-amount-input');
    const amount = parseInt(amountInput.value);
    if (isNaN(amount) || amount <= 0) return alert("Please enter a valid amount of chips.");
    
    if (socket && currentUser) {
        socket.emit('withdraw_savings', { username: currentUser, amount: amount });
    } else {
        // Local offline mode
        if (globalSavings < amount) return alert("Not enough savings to withdraw!");
        globalPoints += amount;
        globalSavings -= amount;
        localStorage.setItem('poker_savings', globalSavings);
        updateSavingsUI();
        updateGlobalStats();
    }
    amountInput.value = '';
}

// Tab Key Listeners for Online Players Overlay
window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        showTabOverlay();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        hideTabOverlay();
    }
});

let isTabOverlayOpen = false;

function showTabOverlay() {
    if (isTabOverlayOpen) return;
    isTabOverlayOpen = true;
    
    const overlay = document.getElementById('player-tab-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        // Request fresh data from server
        if (socket && socket.connected) {
            socket.emit('request_online_players');
        } else {
            // Offline/Local player fallback
            renderOfflineTabOverlay();
        }
    }
}

function hideTabOverlay() {
    isTabOverlayOpen = false;
    const overlay = document.getElementById('player-tab-overlay');
    if (overlay) overlay.style.display = 'none';
}

function renderOfflineTabOverlay() {
    const listContainer = document.getElementById('player-tab-list');
    if (!listContainer) return;
    const name = currentUser || 'Local Guest';
    const total = globalPoints + globalSavings;
    listContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);">
            <span style="font-weight: bold; color: #38bdf8;">${name} (You)</span>
            <span style="color: #fbbf24; font-weight: bold; font-size: 1.05rem;">${total} <span style="font-size: 0.85rem; color: #94a3b8; font-weight: normal;">(${globalPoints} + ${globalSavings} Bank)</span></span>
        </div>
    `;
}

function transferChips() {
    const amountInput = document.getElementById('savings-amount-input');
    const recipientInput = document.getElementById('transfer-recipient-input');
    
    const amount = parseInt(amountInput.value);
    const recipient = recipientInput.value.trim();
    
    if (isNaN(amount) || amount <= 0) return alert("Please enter a valid amount of chips.");
    if (!recipient) return alert("Please enter the recipient's username.");
    if (currentUser && recipient.toLowerCase() === currentUser.toLowerCase()) {
        return alert("You cannot transfer chips to yourself!");
    }
    
    if (socket && currentUser) {
        socket.emit('transfer_chips', { sender: currentUser, recipient: recipient, amount: amount });
    } else {
        alert("You must be logged in to transfer chips to other players!");
    }
    
    amountInput.value = '';
    recipientInput.value = '';
}

// --- PLAYTIME REWARD SYSTEM ---
function startPlayTimeTimer() {
    // Initial render
    renderPlayTimeUI();
    
    setInterval(() => {
        // Only run if user is active (global stats bar is displayed)
        const statsBar = document.getElementById('persistent-stats');
        if (!statsBar || statsBar.style.display === 'none') return;
        
        playTimeSeconds++;
        localStorage.setItem('poker_play_time_seconds', playTimeSeconds);
        
        renderPlayTimeUI();
    }, 1000);
}

function renderPlayTimeUI() {
    const counterEl = document.getElementById('play-time-counter');
    const btnEl = document.getElementById('claim-time-reward-btn');
    if (!counterEl || !btnEl) return;
    
    const milestone = rewardMilestones[playTimeLevel];
    if (!milestone) return;
    
    const formatTime = (secs) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        const pad = (val) => String(val).padStart(2, '0');
        if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
        return `${pad(m)}:${pad(s)}`;
    };
    
    counterEl.textContent = `${formatTime(playTimeSeconds)} / ${formatTime(milestone.time)}`;
    
    if (playTimeSeconds >= milestone.time) {
        btnEl.disabled = false;
        btnEl.textContent = `Claim (${milestone.chips})`;
        btnEl.classList.add('ready-to-claim');
    } else {
        btnEl.disabled = true;
        btnEl.textContent = `Claim (${milestone.chips})`;
        btnEl.classList.remove('ready-to-claim');
    }
}

function claimTimeReward() {
    const milestone = rewardMilestones[playTimeLevel];
    if (!milestone || playTimeSeconds < milestone.time) return;
    
    // Add chips
    globalPoints += milestone.chips;
    updateGlobalStats();
    if (socket && currentUser) {
        socket.emit('admin_set_chips', { username: currentUser, chips: globalPoints });
    }
    
    // Confetti effect
    triggerGoldenCelebration();
    alert(`Congratulations! You spent ${milestone.name} playing and earned ${milestone.chips} chips!`);
    
    // Advance to next milestone level
    playTimeLevel++;
    if (playTimeLevel >= rewardMilestones.length) {
        // Reset and loop back to the 5-minute reward
        playTimeLevel = 0;
        playTimeSeconds = 0;
        localStorage.setItem('poker_play_time_seconds', 0);
    }
    
    localStorage.setItem('poker_play_time_level', playTimeLevel);
    renderPlayTimeUI();
}
