// --- MULTIPLAYER POKER LOGIC ---
let pokerDeck = [];
let players = []; 
let communityCards = [];
let pokerStage = 0; // 0: Init, 1: Pre-flop, 2: Flop, 3: Turn, 4: River, 5: Showdown
let pokerPot = 0;
let highestBet = 0;
let currentTurnIdx = 0;
let dealerIdx = 0;
let pokerAnte = 5;
let isRoundActive = false;
let playersActedThisRound = 0;
// --- LOBBY NAVIGATION & AUTH ---
function showLobbyView(viewId) {
    const lobbyContainer = document.getElementById('poker-lobby-container');
    if (lobbyContainer) lobbyContainer.style.display = 'block';
    
    const views = ['auth-view', 'mode-select-view', 'multiplayer-select-view', 'waiting-room-view', 'offline-lobby-view', 'admin-view'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.style.display = 'none';
    });
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';
}

function adminGiveChips() {
    const username = document.getElementById('admin-target-username').value.trim();
    const amount = parseInt(document.getElementById('admin-chip-amount').value);
    const msgEl = document.getElementById('admin-message');
    
    if (!username || isNaN(amount)) {
        msgEl.style.color = '#f87171';
        msgEl.textContent = "Please fill out all fields.";
        return;
    }
    
    msgEl.style.color = '#fbbf24';
    msgEl.textContent = "Processing...";
    
    const serverUrl = window.location.origin.startsWith('http') ? '' : 'http://localhost:3000';
    fetch(serverUrl + '/api/admin/add-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUsername: username, amount: amount })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            msgEl.style.color = '#f87171';
            msgEl.textContent = data.error;
        } else {
            msgEl.style.color = '#4ade80';
            msgEl.textContent = data.message;
            document.getElementById('admin-target-username').value = '';
        }
    })
    .catch(err => {
        msgEl.style.color = '#f87171';
        msgEl.textContent = "Server is offline or unreachable.";
    });
}

function skipAuth() {
    document.getElementById('view-auth').classList.remove('active-view');
    document.getElementById('global-nav').style.display = 'flex';
    switchGame('bar');
    document.getElementById('auth-error').textContent = '';
}

function registerUser() {
    const user = document.getElementById('auth-username').value;
    const pass = document.getElementById('auth-password').value;
    const err = document.getElementById('auth-error');
    if (!user || !pass) { err.textContent = "Please fill in all fields."; return; }
    
    const serverUrl = window.location.origin.startsWith('http') ? '' : 'http://localhost:3000';
    fetch(serverUrl + '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
    })
    .then(r => r.json())
    .then(data => {
        if(data.error) err.textContent = data.error;
        else {
            err.style.color = '#4ade80';
            err.textContent = "Registered successfully! Please Login.";
        }
    })
    .catch(e => err.textContent = "Server offline.");
}

function loginUser() {
    const user = document.getElementById('auth-username').value;
    const pass = document.getElementById('auth-password').value;
    const err = document.getElementById('auth-error');
    if (!user || !pass) { err.textContent = "Please fill in all fields."; return; }
    
    const serverUrl = window.location.origin.startsWith('http') ? '' : 'http://localhost:3000';
    fetch(serverUrl + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
    })
    .then(r => r.json())
    .then(data => {
        if(data.error) err.textContent = data.error;
        else {
            currentUser = data.username;
            currentToken = data.token;
            globalPoints = data.chips; // set global chips
            globalSavings = data.savings || 0;
            localStorage.setItem('poker_savings', globalSavings);
            if (typeof updateSavingsUI === 'function') {
                updateSavingsUI();
            }
            updateGlobalStats();
            
            if (typeof registerSocketUser === 'function') {
                registerSocketUser();
            }
            
            // Show admin button only for cupoftomato
            if (currentUser.toLowerCase() === 'cupoftomato') {
                document.getElementById('nav-admin-btn').style.display = 'inline-block';
            }
            
            // Advance to game
            document.getElementById('view-auth').classList.remove('active-view');
            document.getElementById('global-nav').style.display = 'flex';
            switchGame('bar');
        }
    })
    .catch(e => err.textContent = "Server offline.");
}

// --- MULTIPLAYER ROOM LOGIC ---
let currentRoomCode = null;
let isRoomHost = false;
let isMultiplayerGame = false;
let lastMpRoundActive = false;

function hostMultiplayerRoom() {
    if (!socket || !currentUser) return alert("You must be connected to the server to host.");
    const maxPlayers = parseInt(document.getElementById('host-max-players').value);
    const buyIn = parseInt(document.getElementById('host-buy-in').value);
    const isPrivate = document.getElementById('host-room-privacy').value === 'private';
    
    if (globalPoints < buyIn) return alert("You don't have enough chips for this buy-in.");
    
    socket.emit('host_poker_room', { maxPlayers, buyIn, username: currentUser, isPrivate });
}

function joinMultiplayerRoom() {
    if (!socket || !currentUser) return alert("You must be connected to the server to join.");
    const code = document.getElementById('join-room-code').value.trim();
    if (!code) return alert("Please enter a room code.");
    
    socket.emit('join_poker_room', { code, username: currentUser });
}

function updateMultiplayerRoomsUI(rooms) {
    const listContainer = document.getElementById('poker-active-rooms-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    // Filter rooms to only show active ones
    if (!rooms || rooms.length === 0) {
        listContainer.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 20px 0; font-size: 0.95rem;">No active rooms found.</div>';
        return;
    }
    
    rooms.forEach(room => {
        const item = document.createElement('div');
        item.style.background = 'rgba(30, 41, 59, 0.8)';
        item.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        item.style.borderRadius = '8px';
        item.style.padding = '12px';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.gap = '10px';
        
        const info = document.createElement('div');
        info.style.textAlign = 'left';
        
        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.style.color = '#fbbf24';
        title.style.fontSize = '0.95rem';
        title.innerHTML = `${room.isPrivate ? '🔒 ' : '🌐 '}${room.hostName}'s Table`;
        
        const details = document.createElement('div');
        details.style.fontSize = '0.8rem';
        details.style.color = '#cbd5e1';
        details.style.marginTop = '4px';
        details.textContent = `Buy-in: ${room.buyIn} | Players: ${room.playersCount}/${room.maxPlayers}`;
        
        info.appendChild(title);
        info.appendChild(details);
        
        const button = document.createElement('button');
        button.className = room.isPrivate ? 'bet-btn xyric-btn' : 'bet-btn play-btn';
        button.style.margin = '0';
        button.style.padding = '6px 12px';
        button.style.fontSize = '0.85rem';
        button.style.width = 'auto';
        
        if (room.state !== 'waiting') {
            button.textContent = 'In Progress';
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
        } else if (room.playersCount >= room.maxPlayers) {
            button.textContent = 'Full';
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
        } else {
            button.textContent = room.isPrivate ? 'Unlock' : 'Join';
            button.onclick = () => joinActiveRoom(room.code, room.isPrivate);
        }
        
        item.appendChild(info);
        item.appendChild(button);
        listContainer.appendChild(item);
    });
}

function joinActiveRoom(code, isPrivate) {
    if (!socket || !currentUser) return alert("You must be connected to the server to join.");
    
    if (isPrivate) {
        const inputCode = prompt("Enter 4-character Room Code:");
        if (!inputCode) return; // User cancelled or left empty
        socket.emit('join_poker_room', { code: inputCode.trim(), username: currentUser });
    } else {
        socket.emit('join_poker_room', { code: code, username: currentUser });
    }
}

function leaveWaitingRoom() {
    if (currentRoomCode && socket) {
        socket.emit('leave_poker_room', { code: currentRoomCode });
    }
    currentRoomCode = null;
    isRoomHost = false;
    showLobbyView('multiplayer-select-view');
    document.getElementById('poker-room').style.display = 'none';
    document.getElementById('waiting-room-view').style.display = 'none';
}

function updateWaitingRoomUI(code, room) {
    if (!room) return;
    document.getElementById('room-code-display').textContent = code;
    document.getElementById('player-count-display').textContent = `${room.players.length}/${room.maxPlayers}`;
    
    const list = document.getElementById('room-player-list');
    list.innerHTML = '';
    
    room.players.forEach(p => {
        const li = document.createElement('li');
        li.style.padding = '8px';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        li.innerHTML = p.socketId === room.host ? `👑 <strong style="color: #fbbf24">${p.username}</strong>` : `👤 ${p.username}`;
        list.appendChild(li);
    });
    
    const startBtn = document.getElementById('start-multiplayer-btn');
    if (isRoomHost && room.players.length >= 2) {
        startBtn.style.display = 'inline-block';
    } else {
        startBtn.style.display = 'none';
    }
}

function startMultiplayerGame() {
    if (currentRoomCode && socket) {
        socket.emit('start_poker_game', { code: currentRoomCode });
    }
}
let lastMpCommunityCount = 0;
let lastMpActionLogLength = 0;
let lastMpStage = -1;

function updateMultiplayerPokerUI(state) {
    isMultiplayerGame = true;
    document.getElementById('waiting-room-view').style.display = 'none';
    document.getElementById('poker-lobby-container').style.display = 'none';
    document.getElementById('poker-room').style.display = 'block';

    // Track multiplayer win/lose streaks
    let isHandFinished = !state.isRoundActive && lastMpRoundActive;
    if (isHandFinished && state.handWinners && state.handWinners.length > 0) {
        const didIWin = state.handWinners.includes(socket.id);
        if (didIWin) {
            globalWinStreak++;
            globalLoseStreak = 0;
            if (globalWinStreak === 3) playJackpotTheme();
            if (globalWinStreak === 5) triggerGoldenCelebration();
        } else {
            globalWinStreak = 0;
            globalLoseStreak++;
            stopJackpotTheme();
        }
        updateGlobalStats();
    }
    lastMpRoundActive = state.isRoundActive;

    
    if (state.actionLog.length === 0) {
        lastMpActionLogLength = 0;
    } else if (state.actionLog.length > lastMpActionLogLength) {
        const latestAction = state.actionLog[state.actionLog.length - 1].toLowerCase();
        if (latestAction.includes('fold')) playPokerSound('fold');
        else if (latestAction.includes('check')) playPokerSound('check');
        else if (latestAction.includes('call')) playPokerSound('call');
        else if (latestAction.includes('raise')) playPokerSound('raise');
        lastMpActionLogLength = state.actionLog.length;
    }

    let isNewHandDeal = (state.stage === 0 && lastMpStage !== 0);
    if (isNewHandDeal) {
        const deckVisual = document.getElementById('deck-poker');
        if (deckVisual) {
            deckVisual.classList.add('shuffling');
            setTimeout(() => deckVisual.classList.remove('shuffling'), 1500);
        }
        playDealSound();
        lastMpCommunityCount = 0;
    }
    
    // Get player combo highlights
    let myPlayer = state.players.find(p => p.socketId === socket.id);
    let highlightIds = [];
    if (myPlayer && myPlayer.holeCards && myPlayer.holeCards.length > 0) {
        const visibleCommCards = state.communityCards.filter(c => !c.isHidden);
        const pEval = evaluateHand([...myPlayer.holeCards, ...visibleCommCards]);
        highlightIds = pEval.bestCards.map(c => c.id);
    }
    
    // 1. Render Opponents (everyone except us)
    const container = document.getElementById('bots-container');
    container.innerHTML = '';
    
    let opponents = state.players.filter(p => p.socketId !== socket.id);
    const middleIndex = Math.ceil(opponents.length / 2);
    let botsAdded = 0;
    
    opponents.forEach((bot, idx) => {
        let opponentHighlightIds = [];
        if (bot.holeCards.length > 0) {
            const bEval = evaluateHand([...bot.holeCards, ...state.communityCards]);
            opponentHighlightIds = bEval.bestCards.map(c => c.id);
        }
        
        const pod = document.createElement('div');
        pod.className = `bot-pod ${bot.hasFolded ? 'folded' : ''} ${state.turnSocketId === bot.socketId && state.isRoundActive ? 'active-turn' : ''}`;
        pod.id = `mp-bot-${idx}`;
        pod.innerHTML = `
            <div class="bot-avatar">👤</div>
            <div class="bot-name">${bot.username}</div>
            <div class="bot-chips">${bot.chips}</div>
            <div class="bot-action">${bot.hasFolded ? 'Folded' : 'Bet: ' + bot.currentRoundBet}</div>
            <div class="bot-cards-mini">
                ${bot.holeCards.length > 0 ? 
                    bot.holeCards.map(c => {
                        const isHighlight = opponentHighlightIds.includes(c.id);
                        return `<div class="mini-card revealed ${c.isRed ? 'red' : ''} ${isHighlight ? 'highlight-card' : ''}">${c.value}${c.suit}</div>`;
                    }).join('') :
                    (bot.hasFolded ? '' : `<div class="mini-card ${isNewHandDeal ? 'anim-deal' : ''}" style="${isNewHandDeal ? `animation-delay: ${idx*0.1}s` : ''}"></div><div class="mini-card ${isNewHandDeal ? 'anim-deal' : ''}" style="${isNewHandDeal ? `animation-delay: ${(idx*0.1)+0.05}s` : ''}"></div>`)
                }
            </div>
            ${bot.evalName ? `<div style="font-size:0.85rem; font-weight:bold; color:#1e293b; background:#fbbf24; border-radius:4px; padding:2px 6px; display:inline-block; margin-top:4px; box-shadow:0 2px 4px rgba(0,0,0,0.3); border:1px solid #d97706; text-transform:uppercase;">${bot.evalName}</div>` : ''}
        `;
        container.appendChild(pod);
        botsAdded++;
        
        if (botsAdded === middleIndex) {
            const dealer = document.createElement('div');
            dealer.innerHTML = `
                <img src="cat1.jpg" alt="Dealer" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; border: 3px solid #fbbf24; box-shadow: 0 5px 15px rgba(0,0,0,0.5); display: block; margin: 0 auto;">
                <div style="color: #fbbf24; font-size: 0.8rem; font-weight: bold; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px; text-shadow: 0 2px 4px rgba(0,0,0,0.6); text-align: center;">Dealer</div>
            `;
            dealer.style.margin = '0 10px';
            dealer.style.display = 'flex';
            dealer.style.flexDirection = 'column';
            dealer.style.justifyContent = 'center';
            container.appendChild(dealer);
        }
    });

    // 2. Render Us
    if (myPlayer) {
        document.getElementById('player-stack').textContent = myPlayer.chips;
        
        const pHole = document.getElementById('player-hole-cards');
        pHole.innerHTML = '';
        let holeBaseAnimIndex = 0;
        myPlayer.holeCards.forEach(c => {
            let animIndex = isNewHandDeal ? holeBaseAnimIndex++ : -1;
            const isHighlight = highlightIds.includes(c.id);
            pHole.appendChild(renderPokerCard(c, false, isHighlight, animIndex));
        });
        if (holeBaseAnimIndex > 0) playDealSound();
        
        const evalHeader = document.getElementById('player-eval-header');
        if (evalHeader) {
            if (myPlayer.holeCards.length > 0) {
                const pEval = evaluateHand([...myPlayer.holeCards, ...state.communityCards]);
                let displayVal = pEval.name;
                if (pEval.name === "Pair" && state.communityCards.length === 0) {
                    displayVal = "Pocket Pair";
                }
                evalHeader.innerHTML = `Your Hand: <span style="color:#fbbf24; font-weight:bold; text-shadow:0 0 10px rgba(251,191,36,0.6); background: rgba(251,191,36,0.15); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(251,191,36,0.3);">${displayVal}</span>`;
            } else {
                evalHeader.textContent = 'Your Hand';
            }
        }
    }
    
    // 3. Render Community
    document.getElementById('pot-display').textContent = `Pot: ${state.pot}`;
    const comm = document.getElementById('community-cards');
    comm.innerHTML = '';
    
    let commAnimBase = 0;
    state.communityCards.forEach((c, idx) => {
        let animIndex = -1;
        if (idx >= lastMpCommunityCount) {
            animIndex = commAnimBase++;
        }
        const isHighlight = highlightIds.includes(c.id);
        comm.appendChild(renderPokerCard(c, false, isHighlight, animIndex));
    });
    if (commAnimBase > 0) playDealSound();
    
    // 4. Action Log
    if (state.actionLog.length > 0) {
        document.getElementById('table-action-text').textContent = state.actionLog[state.actionLog.length - 1];
    }
    
    // 5. Buttons
    const actionsDiv = document.getElementById('poker-actions');
    if (state.isRoundActive && myPlayer && state.turnSocketId === socket.id && !myPlayer.hasFolded) {
        actionsDiv.style.display = 'flex';
        const callAmount = state.highestBet - myPlayer.currentRoundBet;
        
        document.getElementById('btn-check').disabled = callAmount > 0;
        document.getElementById('btn-call').textContent = callAmount > 0 ? `Call ${callAmount}` : 'Call';
        document.getElementById('btn-call').disabled = callAmount === 0;
        
        if (callAmount > 0 && myPlayer.chips <= callAmount) {
            document.getElementById('btn-call').textContent = `All-In (${myPlayer.chips})`;
        }
    } else {
        actionsDiv.style.display = 'none';
    }
    
    // End of Hand reset button for Host
    const nextHandBtn = document.getElementById('next-hand-btn');
    if (nextHandBtn) nextHandBtn.classList.remove('show');
    
    lastMpCommunityCount = state.communityCards.length;
    lastMpStage = state.stage;
}

// --- AUDIO SYNTHESIS FOR POKER ---
const pokerAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
const raiseAudio = new Audio('raise_sound.webm');
raiseAudio.volume = (window.sfxVolume !== undefined ? window.sfxVolume : 0.8) * 0.4; 

const dealAudio = new Audio('deal_sound.webm');
dealAudio.volume = (window.sfxVolume !== undefined ? window.sfxVolume : 0.8) * 0.6;

function synthesizeDealSound() {
    try {
        if (pokerAudioCtx.state === 'suspended') pokerAudioCtx.resume();
        const t = pokerAudioCtx.currentTime;
        const bufferSize = pokerAudioCtx.sampleRate * 0.12; 
        const buffer = pokerAudioCtx.createBuffer(1, bufferSize, pokerAudioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        
        const noise = pokerAudioCtx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = pokerAudioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        filter.Q.value = 3;
        
        const gain = pokerAudioCtx.createGain();
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(pokerAudioCtx.destination);
        noise.start(t);
    } catch (err) {
        console.error("Synthesizer error:", err);
    }
}

function synthesizeRaiseSound() {
    try {
        if (pokerAudioCtx.state === 'suspended') pokerAudioCtx.resume();
        const t = pokerAudioCtx.currentTime;
        const freqs = [1800, 2400, 3200, 4500];
        freqs.forEach((f, idx) => {
            const osc = pokerAudioCtx.createOscillator();
            const gain = pokerAudioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            
            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08 + (idx * 0.02));
            
            osc.connect(gain);
            gain.connect(pokerAudioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.15);
        });
    } catch (err) {
        console.error("Synthesizer error:", err);
    }
}

function playDealSound() {
    dealAudio.currentTime = 1.0;
    dealAudio.play()
        .then(() => {
            setTimeout(() => { dealAudio.pause(); }, 1000);
        })
        .catch(e => {
            console.log('Deal audio error, falling back to synthesis:', e);
            synthesizeDealSound();
        });
}

function playPokerSound(type) {
    if (pokerAudioCtx.state === 'suspended') pokerAudioCtx.resume();
    const t = pokerAudioCtx.currentTime;
    
    if (type === 'raise' || type === 'call') {
        raiseAudio.currentTime = 0;
        raiseAudio.play()
            .then(() => {
                setTimeout(() => {
                    raiseAudio.pause();
                }, 1000);
            })
            .catch(e => {
                console.log("Audio play error, falling back to synthesis:", e);
                synthesizeRaiseSound();
            });
    } else if (type === 'fold') {
        const bufferSize = pokerAudioCtx.sampleRate * 0.3; 
        const buffer = pokerAudioCtx.createBuffer(1, bufferSize, pokerAudioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = pokerAudioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = pokerAudioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        const gain = pokerAudioCtx.createGain();
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(pokerAudioCtx.destination);
        noise.start(t);
    } else if (type === 'check') {
        for(let i=0; i<2; i++) {
            const osc = pokerAudioCtx.createOscillator();
            const gain = pokerAudioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, t + i*0.15);
            osc.frequency.exponentialRampToValueAtTime(40, t + i*0.15 + 0.1);
            gain.gain.setValueAtTime(0.4, t + i*0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i*0.15 + 0.1);
            osc.connect(gain);
            gain.connect(pokerAudioCtx.destination);
            osc.start(t + i*0.15);
            osc.stop(t + i*0.15 + 0.15);
        }
    }
}

function buildPokerDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    let deck = [];
    let idGen = 0;
    for (let s of suits) deck.push(...values.map(v => ({ id: idGen++, suit: s, value: v, isRed: s === '♥' || s === '♦' })));
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function initPokerGame(isFirstLoad = false) {
    showLobbyView('mode-select-view');
    document.getElementById('poker-room').style.display = 'none';
    if (isFirstLoad) {
        buildCardTracker();
    }
}

function buildCardTracker() {
    const suits = [
        { symbol: '♥', name: 'Hearts', color: 'red' },
        { symbol: '♣', name: 'Clubs', color: 'black' },
        { symbol: '♦', name: 'Diamonds', color: 'red' },
        { symbol: '♠', name: 'Spades', color: 'black' }
    ];
    const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const grid = document.getElementById('tracker-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // Override the global flex to block, so groups stack vertically
    grid.style.display = 'block';
    
    for (let s of suits) {
        const group = document.createElement('div');
        group.style.marginBottom = '15px';
        
        const header = document.createElement('div');
        header.style.color = s.color === 'red' ? '#ef4444' : '#f8fafc';
        header.style.fontWeight = 'bold';
        header.style.marginBottom = '5px';
        header.style.fontSize = '1.1rem';
        header.innerHTML = `${s.symbol} ${s.name}`;
        group.appendChild(header);
        
        const cardContainer = document.createElement('div');
        cardContainer.style.display = 'flex';
        cardContainer.style.flexWrap = 'wrap';
        cardContainer.style.gap = '6px';
        
        for (let v of values) {
            const card = document.createElement('div');
            card.className = `tracker-card ${s.color === 'red' ? 'red' : ''}`;
            card.innerHTML = `${v}<br><span style="font-size:0.9rem">${s.symbol}</span>`;
            card.onclick = () => card.classList.toggle('darkened');
            cardContainer.appendChild(card);
        }
        
        group.appendChild(cardContainer);
        grid.appendChild(group);
    }
}

function enterPokerRoom() {
    const numBots = parseInt(document.getElementById('poker-bot-count').value);
    const buyIn = parseInt(document.getElementById('poker-buy-in').value);
    const errorEl = document.getElementById('lobby-error');
    if (errorEl) errorEl.textContent = '';
    
    if (isNaN(numBots) || numBots < 1 || numBots > 5) {
        if(errorEl) errorEl.textContent = "Choose 1-5 bots."; else alert("Choose 1-5 bots.");
        return;
    }
    if (globalPoints === 0) {
        if (buyIn !== 0) {
            if (errorEl) errorEl.textContent = "You have 0 chips. You can only enter with a 0 Buy-In!";
            else alert("You have 0 chips. You can only enter with a 0 Buy-In!");
            return;
        }
    } else {
        if (isNaN(buyIn) || buyIn < 10) {
            if(errorEl) errorEl.textContent = "Buy-In must be at least 10 chips."; else alert("Buy-In must be at least 10 chips.");
            return;
        }
        if (buyIn > globalPoints) {
            if(errorEl) errorEl.textContent = "You don't have enough chips."; else alert("You don't have enough chips.");
            return;
        }
    }
    
    globalPoints -= buyIn;
    updateGlobalStats();
    
    // Clear Tracker Note for the new game
    document.querySelectorAll('.tracker-card.darkened').forEach(c => c.classList.remove('darkened'));
    
    players = [];
    players.push({
        id: 0, name: "You", isHuman: true, chips: buyIn,
        currentRoundBet: 0, hasFolded: false, isAllIn: false, holeCards: []
    });
    
    const botNames = ["Bot Alpha", "Bot Bravo", "Bot Charlie", "Bot Delta", "Bot Echo"];
    for(let i=0; i<numBots; i++) {
        players.push({
            id: i+1, name: botNames[i], isHuman: false, chips: buyIn,
            currentRoundBet: 0, hasFolded: false, isAllIn: false, holeCards: []
        });
    }
    
    dealerIdx = players.length - 1; 
    
    const lobbyContainer = document.getElementById('poker-lobby-container');
    if (lobbyContainer) lobbyContainer.style.display = 'none';
    document.getElementById('poker-room').style.display = 'block';
    

    
    renderBotsUI();
    startNewHand();
}

function leavePokerRoom() {
    if (isMultiplayerGame) {
        socket.emit('leave_poker_room', { code: currentRoomCode });
        isMultiplayerGame = false;
        currentRoomCode = null;
        isRoomHost = false;
        document.getElementById('poker-room').style.display = 'none';
        showLobbyView('multiplayer-select-view');

        return;
    }
    
    if (isRoundActive) {
        if (!confirm("A hand is active! If you leave, you fold and forfeit the pot. Leave anyway?")) return;
    }
    if (players[0]) {
        globalPoints += players[0].chips;
        updateGlobalStats();
    }

    initPokerGame();
}

function renderBotsUI() {
    const container = document.getElementById('bots-container');
    container.innerHTML = '';
    
    const numBots = players.length - 1;
    const middleIndex = Math.ceil(numBots / 2);
    let botsAdded = 0;
    
    for (let i=1; i<players.length; i++) {
        const bot = players[i];
        const pod = document.createElement('div');
        pod.className = 'bot-pod';
        pod.id = `bot-pod-${i}`;
        pod.innerHTML = `
            <div class="bot-avatar">🤖</div>
            <div class="bot-name">${bot.name}</div>
            <div class="bot-chips" id="bot-chips-${i}">${bot.chips}</div>
            <div class="bot-action" id="bot-action-${i}">Waiting</div>
            <div class="bot-cards-mini" id="bot-cards-${i}">
                <div class="mini-card"></div>
                <div class="mini-card"></div>
            </div>
        `;
        container.appendChild(pod);
        botsAdded++;
        
        if (botsAdded === middleIndex) {
            const dealer = document.createElement('div');
            dealer.innerHTML = `
                <img src="cat1.jpg" alt="Dealer" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; border: 3px solid #fbbf24; box-shadow: 0 5px 15px rgba(0,0,0,0.5); display: block; margin: 0 auto;">
                <div style="color: #fbbf24; font-size: 0.8rem; font-weight: bold; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px; text-shadow: 0 2px 4px rgba(0,0,0,0.6); text-align: center;">Dealer</div>
            `;
            dealer.style.margin = '0 10px';
            dealer.style.display = 'flex';
            dealer.style.flexDirection = 'column';
            dealer.style.justifyContent = 'center';
            container.appendChild(dealer);
        }
    }
}

function updateBotsUI() {
    for (let i=1; i<players.length; i++) {
        const bot = players[i];
        const pod = document.getElementById(`bot-pod-${i}`);
        if(!pod) continue;
        
        document.getElementById(`bot-chips-${i}`).textContent = bot.chips;
        
        if (bot.hasFolded) {
            pod.classList.add('folded');
            document.getElementById(`bot-action-${i}`).textContent = 'Folded';
        } else {
            pod.classList.remove('folded');
        }
        
        if (currentTurnIdx === i && isRoundActive) {
            pod.classList.add('active-turn');
        } else {
            pod.classList.remove('active-turn');
        }
    }
}

function setTableText(msg) {
    document.getElementById('table-action-text').textContent = msg;
}

function startNewHand() {
    isRoundActive = true;
    document.getElementById('next-hand-btn').classList.remove('show');
    document.getElementById('result-poker').classList.remove('show');
    document.getElementById('poker-actions').style.display = 'none';
    setTableText("Dealing new hand...");
    
    if (players[0].chips < pokerAnte) {
        setTableText("You are out of chips! Leaving table...");
        setTimeout(() => leavePokerRoom(), 2500);
        return;
    }
    players = players.filter(p => p.isHuman || p.chips >= pokerAnte);
    if (players.length === 1) {
        setTableText("You busted all the bots! You win! Leaving table...");
        setTimeout(() => leavePokerRoom(), 2500);
        return;
    }
    
    renderBotsUI(); 
    
    pokerPot = 0;
    highestBet = pokerAnte;
    communityCards = [];
    pokerStage = 0;
    pokerDeck = buildPokerDeck();
    
    const deckVisual = document.getElementById('deck-poker');
    if (deckVisual) deckVisual.classList.add('shuffling');
    setTableText("Dealer is shuffling...");
    
    setTimeout(() => {
        if (deckVisual) deckVisual.classList.remove('shuffling');
        
        // SECRET RIGGING SYSTEM: 2% chance to guarantee A-K suited for player if streak >= 3
        if (globalWinStreak >= 3 && Math.random() < 0.02) {
            let p1 = pokerDeck.findIndex(c => c.value === 'A' && c.suit === '♠');
            let p2 = pokerDeck.findIndex(c => c.value === 'K' && c.suit === '♠');
            // Move them to the end of the array (top of the deck, since we pop())
            if (p1 > -1 && p2 > -1) {
                let c1 = pokerDeck.splice(p1, 1)[0];
                p2 = pokerDeck.findIndex(c => c.value === 'K' && c.suit === '♠'); // Re-find in case index shifted
                let c2 = pokerDeck.splice(p2, 1)[0];
                pokerDeck.push(c2, c1);
            }
        }
        
        players.forEach((p, idx) => {
            p.hasFolded = false;
            p.isAllIn = false;
            p.currentRoundBet = pokerAnte;
            p.holeCards = [pokerDeck.pop(), pokerDeck.pop()];
            p.chips -= pokerAnte;
            pokerPot += pokerAnte;
            
            if(idx > 0) {
                document.getElementById(`bot-action-${idx}`).textContent = `Ante ${pokerAnte}`;
                document.getElementById(`bot-cards-${idx}`).innerHTML = `<div class="mini-card anim-deal" style="animation-delay: ${idx * 0.1}s"></div><div class="mini-card anim-deal" style="animation-delay: ${(idx * 0.1) + 0.05}s"></div>`;
            }
        });
        
        // Clear old DOM to force deal animation for hole cards
        document.getElementById('player-hole-cards').innerHTML = '';
        document.getElementById('community-cards').innerHTML = '';
        
        playDealSound();
        updatePlayerUI(true); // Render without highlights during deal
        updateBotsUI();
        
        dealerIdx = (dealerIdx + 1) % players.length;
        
        setTimeout(() => {
            updatePlayerUI(false); // Add highlights after deal
            startBettingRound(1); 
        }, 1500);
        
    }, 2000);
}

function startBettingRound(stage) {
    pokerStage = stage;
    highestBet = 0;
    playersActedThisRound = 0;
    
    players.forEach(p => { p.currentRoundBet = 0; });
    
    let newCards = [];
    if (stage === 2) {
        newCards.push(pokerDeck.pop(), pokerDeck.pop(), pokerDeck.pop());
        setTableText("Dealing Flop...");
    } else if (stage === 3) {
        newCards.push(pokerDeck.pop());
        setTableText("Dealing Turn...");
    } else if (stage === 4) {
        newCards.push(pokerDeck.pop());
        setTableText("Dealing River...");
    }
    
    if (newCards.length > 0) {
        communityCards.push(...newCards);
        playDealSound();
        updatePlayerUI(true); // Render with sliding anim, skip highlights initially
        updateBotsUI();
        
        // Pause interactions
        isRoundActive = false;
        
        // Wait for sliding animations to finish
        const totalWait = (newCards.length * 400) + 600;
        
        setTimeout(() => {
            isRoundActive = true;
            updatePlayerUI(false); // Enable highlights once dealt
            
            if (stage === 5) {
                handleShowdown();
                return;
            }
            
            currentTurnIdx = (dealerIdx + 1) % players.length;
            processNextTurn();
        }, totalWait);
        
        return; // Halt normal execution until animation completes
    }
    
    updatePlayerUI();
    updateBotsUI();
    
    if (stage === 5) {
        handleShowdown();
        return;
    }
    
    currentTurnIdx = (dealerIdx + 1) % players.length;
    setTimeout(processNextTurn, 1000);
}

function processNextTurn() {
    if (!isRoundActive) return;
    
    const activePlayers = players.filter(p => !p.hasFolded && !p.isAllIn);
    const nonFolded = players.filter(p => !p.hasFolded);
    
    if (nonFolded.length === 1) {
        handlePrematureWin(nonFolded[0]);
        return;
    }
    
    let roundOver = true;
    for (let p of activePlayers) {
        if (p.currentRoundBet !== highestBet) roundOver = false;
    }
    if (playersActedThisRound < activePlayers.length) roundOver = false;
    
    if (roundOver) {
        if (activePlayers.length <= 1) {
             while(pokerStage < 4) {
                 if (pokerStage === 1) communityCards.push(pokerDeck.pop(), pokerDeck.pop(), pokerDeck.pop());
                 else communityCards.push(pokerDeck.pop());
                 pokerStage++;
             }
             pokerStage = 5;
             handleShowdown();
        } else {
            startBettingRound(pokerStage + 1);
        }
        return;
    }
    
    const p = players[currentTurnIdx];
    if (p.hasFolded || p.isAllIn) {
        advanceTurnIndex();
        processNextTurn();
        return;
    }
    
    updateBotsUI(); 
    
    if (p.isHuman) {
        setTableText("Your turn to act!");
        showPlayerActions();
    } else {
        setTableText(`${p.name} is thinking...`);
        setTimeout(() => botAction(p), 1500);
    }
}

function advanceTurnIndex() {
    currentTurnIdx = (currentTurnIdx + 1) % players.length;
}

function showPlayerActions() {
    const p = players[0];
    const callAmount = highestBet - p.currentRoundBet;
    document.getElementById('poker-actions').style.display = 'flex';
    
    const callBtn = document.getElementById('btn-call');
    if (callAmount > 0) {
        callBtn.textContent = `Call (${callAmount})`;
        callBtn.onclick = uiPlayerCall;
    } else {
        callBtn.textContent = `Check`;
        callBtn.onclick = uiPlayerCall; 
    }
    
    const maxRaise = p.chips - callAmount;
    const raiseContainer = document.getElementById('raise-container');
    const raiseInput = document.getElementById('raise-amount');
    
    if (maxRaise > 0) {
        raiseContainer.style.display = 'flex';
        raiseInput.max = maxRaise;
        raiseInput.value = Math.min(pokerAnte * 2, maxRaise);
    } else {
        raiseContainer.style.display = 'none';
    }
}

function humanAction(action) {
    if (isMultiplayerGame && currentRoomCode && socket) {
        let amount = 0;
        if (action === 'raise') {
            amount = parseInt(document.getElementById('raise-amount').value);
            if (isNaN(amount) || amount <= 0) {
                alert("Invalid raise amount.");
                return;
            }
        }
        socket.emit('poker_action', { code: currentRoomCode, action, amount });
        document.getElementById('poker-actions').style.display = 'none';
    }
}

function uiPlayerFold() {
    if (isMultiplayerGame) return humanAction('fold');
    playPokerSound('fold');
    document.getElementById('poker-actions').style.display = 'none';
    players[0].hasFolded = true;
    playersActedThisRound++;
    advanceTurnIndex();
    processNextTurn();
}

function uiPlayerCall() {
    if (isMultiplayerGame) return humanAction('call');
    document.getElementById('poker-actions').style.display = 'none';
    const p = players[0];
    const callAmount = highestBet - p.currentRoundBet;
    
    if (callAmount > 0) playPokerSound('call');
    else playPokerSound('check');
    
    let actualCall = Math.min(callAmount, p.chips);
    p.chips -= actualCall;
    p.currentRoundBet += actualCall;
    pokerPot += actualCall;
    
    if (p.chips === 0) p.isAllIn = true;
    
    playersActedThisRound++;
    updatePlayerUI();
    advanceTurnIndex();
    processNextTurn();
}

function uiPlayerRaise() {
    if (isMultiplayerGame) return humanAction('raise');
    const p = players[0];
    const callAmount = highestBet - p.currentRoundBet;
    const raiseAmt = parseInt(document.getElementById('raise-amount').value);
    
    if (isNaN(raiseAmt) || raiseAmt <= 0) {
        alert("Invalid raise");
        return;
    }
    
    const totalDeduct = callAmount + raiseAmt;
    if (totalDeduct > p.chips) {
        alert("Not enough chips!");
        return;
    }
    
    playPokerSound('raise');
    document.getElementById('poker-actions').style.display = 'none';
    
    p.chips -= totalDeduct;
    p.currentRoundBet += totalDeduct;
    pokerPot += totalDeduct;
    highestBet = p.currentRoundBet;
    
    if (p.chips === 0) p.isAllIn = true;
    
    playersActedThisRound = 1; 
    updatePlayerUI();
    advanceTurnIndex();
    processNextTurn();
}

function botAction(bot) {
    const callAmount = highestBet - bot.currentRoundBet;
    const bEval = evaluateHand([...bot.holeCards, ...communityCards]);
    
    const score = bEval.score;
    const hasPair = score >= 10000 && score < 20000;
    const hasTwoPairOrBetter = score >= 20000;
    
    // Pity System logic
    let dumbness = 0;
    if (globalLoseStreak >= 6) dumbness = 3;
    else if (globalLoseStreak >= 5) dumbness = 2;
    else if (globalLoseStreak >= 3) dumbness = 1;

    let bluffChance = 0.20 - (dumbness * 0.06); 
    if (bluffChance < 0) bluffChance = 0;
    
    let foldThreshold = 10000; // Normally need Pair to confidently call post-flop bets
    if (dumbness > 0) foldThreshold += (dumbness * 2000); // Dumber bots fold weak pairs too
    
    let raiseChance = 0.30 - (dumbness * 0.10); 
    if (raiseChance < 0) raiseChance = 0;
    
    let action = 'fold';
    let raiseAmt = 0;
    
    if (callAmount === 0) {
        // Can Check or Raise
        if (hasTwoPairOrBetter || (hasPair && Math.random() < raiseChance)) {
            action = 'raise';
            raiseAmt = pokerAnte * 2; 
        } else if (Math.random() < bluffChance) {
            action = 'raise'; // Bluff
            raiseAmt = pokerAnte * 3;
        } else {
            action = 'check';
        }
    } else {
        // Must Call, Fold, or Re-raise
        if (score >= foldThreshold) {
            if (hasTwoPairOrBetter && Math.random() < raiseChance) {
                action = 'raise';
                raiseAmt = callAmount * 2;
            } else {
                action = 'call';
            }
        } else {
            // Hand is weak
            if (pokerStage === 1 && Math.random() < (0.5 - dumbness * 0.15)) {
                action = 'call'; // Call pre-flop sometimes
            } else if (Math.random() < bluffChance) {
                action = 'raise'; // Bluff re-raise
                raiseAmt = callAmount * 3;
            } else {
                action = 'fold';
            }
        }
    }
    
    if (action === 'fold') {
        playPokerSound('fold');
        bot.hasFolded = true;
        document.getElementById(`bot-action-${bot.id}`).textContent = 'Folds';
        setTableText(`${bot.name} Folds.`);
    } else if (action === 'check') {
        playPokerSound('check');
        document.getElementById(`bot-action-${bot.id}`).textContent = 'Checks';
        setTableText(`${bot.name} Checks.`);
    } else if (action === 'call') {
        playPokerSound('call');
        let actualCall = Math.min(callAmount, bot.chips);
        bot.chips -= actualCall;
        bot.currentRoundBet += actualCall;
        pokerPot += actualCall;
        if (bot.chips === 0) bot.isAllIn = true;
        document.getElementById(`bot-action-${bot.id}`).textContent = `Calls ${actualCall}`;
        setTableText(`${bot.name} Calls.`);
    } else if (action === 'raise') {
        playPokerSound('raise');
        raiseAmt = Math.min(raiseAmt, bot.chips - callAmount);
        if (raiseAmt < pokerAnte) {
            // Revert to call if can't make a meaningful raise
            let actualCall = Math.min(callAmount, bot.chips);
            bot.chips -= actualCall;
            bot.currentRoundBet += actualCall;
            pokerPot += actualCall;
            if (bot.chips === 0) bot.isAllIn = true;
            document.getElementById(`bot-action-${bot.id}`).textContent = `Calls ${actualCall}`;
            setTableText(`${bot.name} Calls.`);
        } else {
            const totalDeduct = callAmount + raiseAmt;
            bot.chips -= totalDeduct;
            bot.currentRoundBet += totalDeduct;
            pokerPot += totalDeduct;
            highestBet = bot.currentRoundBet;
            if (bot.chips === 0) bot.isAllIn = true;
            playersActedThisRound = 0; // reset
            document.getElementById(`bot-action-${bot.id}`).textContent = `Raises ${raiseAmt}`;
            setTableText(`${bot.name} Raises!`);
        }
    }
    
    playersActedThisRound++;
    updateBotsUI();
    document.getElementById('pot-display').textContent = `Pot: ${pokerPot}`;
    
    advanceTurnIndex();
    setTimeout(processNextTurn, 1500);
}

function handlePrematureWin(winner) {
    isRoundActive = false;
    winner.chips += pokerPot;
    setTableText(`${winner.name} wins the pot of ${pokerPot}!`);
    finishHand(winner.id === 0);
}

function handleShowdown() {
    isRoundActive = false;
    setTableText("Showdown!");
    playDealSound();
    
    for(let i=1; i<players.length; i++) {
        const bot = players[i];
        if(!bot.hasFolded) {
            const botCardsDiv = document.getElementById(`bot-cards-${i}`);
            botCardsDiv.innerHTML = '';
            bot.holeCards.forEach(c => {
                botCardsDiv.innerHTML += `<div class="mini-card revealed ${c.isRed ? 'red' : ''}">${c.value}${c.suit}</div>`;
            });
            const bEval = evaluateHand([...bot.holeCards, ...communityCards]);
            document.getElementById(`bot-action-${i}`).textContent = bEval.name;
        }
    }
    
    const activePlayers = players.filter(p => !p.hasFolded);
    let bestScore = -1;
    let winners = [];
    
    for (let p of activePlayers) {
        const pEval = evaluateHand([...p.holeCards, ...communityCards]);
        if (pEval.score > bestScore) {
            bestScore = pEval.score;
            winners = [p];
        } else if (pEval.score === bestScore) {
            winners.push(p);
        }
    }
    
    const share = Math.floor(pokerPot / winners.length);
    winners.forEach(w => w.chips += share);
    
    const isHumanWinner = winners.some(w => w.id === 0);
    
    if (winners.length === 1) {
        setTableText(`${winners[0].name} wins with ${evaluateHand([...winners[0].holeCards, ...communityCards]).name}!`);
    } else {
        setTableText(`Split pot between ${winners.map(w=>w.name).join(', ')}!`);
    }
    
    finishHand(isHumanWinner);
}

function finishHand(didHumanWin) {
    updatePlayerUI();
    updateBotsUI();
    document.getElementById('next-hand-btn').classList.add('show');
    
    if (didHumanWin) {
        document.getElementById('bg-flash').className = 'bg-flash won';
        globalWinStreak++;
        globalLoseStreak = 0;
        if (globalWinStreak === 3) playJackpotTheme();
        if (globalWinStreak === 5) triggerGoldenCelebration();
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
            players[0].chips += pityPoints;
            updatePlayerUI();
            setTimeout(() => setTableText(`Pity Bonus! +${pityPoints} chips to your stack.`), 1500);
        }
    }
    updateGlobalStats();
}

function renderPokerCard(card, isHidden = false, isHighlighted = false, animIndex = -1) {
    const el = document.createElement('div');
    el.className = `playing-card ${card.isRed ? 'red' : ''} ${isHidden ? 'hidden-card' : ''} ${isHighlighted ? 'highlight-card' : ''}`;
    if (animIndex >= 0) {
        el.classList.add('anim-deal');
        el.style.animationDelay = `${animIndex * 0.4}s`;
    }
    if (!isHidden) {
        el.setAttribute('data-value', card.value);
        el.textContent = card.suit;
    }
    return el;
}

function updatePlayerUI(skipHighlight = false) {
    if (!players[0]) return;
    document.getElementById('player-stack').textContent = players[0].chips;
    document.getElementById('pot-display').textContent = `Pot: ${pokerPot}`;
    
    const visibleCommCards = communityCards.filter(c => !c.isHidden);
    const pEval = evaluateHand([...players[0].holeCards, ...visibleCommCards]);
    const highlightIds = skipHighlight ? [] : pEval.bestCards.map(c => c.id);
    
    const pHole = document.getElementById('player-hole-cards');
    let oldHoleCount = pHole.children.length;
    pHole.innerHTML = '';
    
    let baseAnimIndex = 0;
    
    players[0].holeCards.forEach((card, idx) => {
        const isHighlight = highlightIds.includes(card.id);
        let animIndex = -1;
        if (idx >= oldHoleCount) animIndex = baseAnimIndex++;
        pHole.appendChild(renderPokerCard(card, false, isHighlight, animIndex));
    });
    
    const comm = document.getElementById('community-cards');
    let oldCommCount = comm.children.length;
    comm.innerHTML = '';
    
    communityCards.forEach((card, idx) => {
        const isHighlight = highlightIds.includes(card.id) && !card.isHidden;
        let animIndex = -1;
        if (idx >= oldCommCount) animIndex = baseAnimIndex++;
        comm.appendChild(renderPokerCard(card, card.isHidden, isHighlight, animIndex));
    });
    
    const evalHeader = document.getElementById('player-eval-header');
    if (evalHeader) {
        if (players[0].holeCards && players[0].holeCards.length > 0) {
            if (pEval.name === "Pair" && visibleCommCards.length === 0) {
                evalHeader.textContent = "Pocket Pair";
            } else {
                evalHeader.textContent = pEval.name;
            }
        } else {
            evalHeader.textContent = 'Your Hand';
        }
    }
}

function evaluateHand(cards) {
    if (cards.length === 0) return { score: 0, name: "Empty", bestCards: [] };
    
    const values = "2345678910JQKA";
    const mapped = cards.map(c => ({
        val: values.indexOf(c.value) + 2, 
        suit: c.suit,
        original: c 
    })).sort((a,b) => b.val - a.val); 
    
    let suitsCount = {};
    let flushSuit = null;
    mapped.forEach(c => {
        suitsCount[c.suit] = (suitsCount[c.suit] || 0) + 1;
        if (suitsCount[c.suit] >= 5) flushSuit = c.suit;
    });
    
    let isFlush = flushSuit !== null;
    let flushCards = isFlush ? mapped.filter(c => c.suit === flushSuit) : [];
    
    function getStraightScore(arr) {
        if (arr.length < 5) return { found: false, cards: [] };
        
        let uniqueMap = new Map();
        arr.forEach(c => {
            if (!uniqueMap.has(c.val)) uniqueMap.set(c.val, c);
        });
        
        let uniqueVals = Array.from(uniqueMap.keys());
        let aceLowCard = null;
        if (uniqueVals.includes(14)) {
            uniqueVals.push(1); 
            aceLowCard = uniqueMap.get(14);
        }
        uniqueVals.sort((a,b) => b-a);
        
        let consecutive = 1;
        let highCard = uniqueVals[0];
        let straightCards = [uniqueMap.get(highCard)];
        
        for (let i = 0; i < uniqueVals.length - 1; i++) {
            if (uniqueVals[i] - 1 === uniqueVals[i+1]) {
                consecutive++;
                let cardToAdd = uniqueVals[i+1] === 1 ? aceLowCard : uniqueMap.get(uniqueVals[i+1]);
                straightCards.push(cardToAdd);
                if (consecutive === 5) return { found: true, high: highCard, cards: straightCards };
            } else {
                consecutive = 1;
                highCard = uniqueVals[i+1];
                straightCards = [uniqueMap.get(highCard)];
            }
        }
        return { found: false, cards: [] };
    }
    
    let strRes = getStraightScore(mapped);
    let isStraight = strRes.found;
    
    let isStraightFlush = false;
    let sfHigh = 0;
    let sfCards = [];
    if (isFlush) {
        let sfRes = getStraightScore(flushCards);
        isStraightFlush = sfRes.found;
        sfHigh = sfRes.high;
        sfCards = sfRes.cards;
    }
    
    let valCounts = {};
    let valGroups = {};
    mapped.forEach(c => { 
        valCounts[c.val] = (valCounts[c.val] || 0) + 1; 
        if(!valGroups[c.val]) valGroups[c.val] = [];
        valGroups[c.val].push(c);
    });
    
    let counts = Object.entries(valCounts)
        .map(e => ({ val: parseInt(e[0]), count: e[1] }))
        .sort((a,b) => b.count - a.count || b.val - a.val);
        
    let score = 0;
    let name = "";
    let bestCards = [];
    
    function getKickers(excludeVals, count) {
        return mapped.filter(c => !excludeVals.includes(c.val)).slice(0, count).map(c => c.original);
    }
    
    if (isStraightFlush) { 
        score = 80000 + sfHigh; 
        name = "Straight Flush"; 
        bestCards = sfCards.map(c=>c.original);
    }
    else if (counts[0].count === 4) { 
        score = 70000 + counts[0].val * 100 + (counts[1] ? counts[1].val : 0); 
        name = "Four of a Kind"; 
        bestCards = [...valGroups[counts[0].val].map(c=>c.original)];
    }
    else if (counts[0].count === 3 && counts[1] && counts[1].count >= 2) { 
        score = 60000 + counts[0].val * 100 + counts[1].val; 
        name = "Full House"; 
        bestCards = [...valGroups[counts[0].val].map(c=>c.original).slice(0,3), ...valGroups[counts[1].val].map(c=>c.original).slice(0,2)];
    }
    else if (isFlush) { 
        score = 50000 + flushCards[0].val * 100 + flushCards[1].val; 
        name = "Flush"; 
        bestCards = flushCards.slice(0,5).map(c=>c.original);
    }
    else if (isStraight) { 
        score = 40000 + strRes.high; 
        name = "Straight"; 
        bestCards = strRes.cards.map(c=>c.original);
    }
    else if (counts[0].count === 3) { 
        score = 30000 + counts[0].val * 100 + (counts[1] ? counts[1].val : 0); 
        name = "Three of a Kind"; 
        bestCards = [...valGroups[counts[0].val].map(c=>c.original)];
    }
    else if (counts[0].count === 2 && counts[1] && counts[1].count >= 2) { 
        score = 20000 + counts[0].val * 100 + counts[1].val * 10 + (counts[2] ? counts[2].val : 0); 
        name = "Two Pair"; 
        bestCards = [...valGroups[counts[0].val].map(c=>c.original).slice(0,2), ...valGroups[counts[1].val].map(c=>c.original).slice(0,2)];
    }
    else if (counts[0].count === 2) { 
        score = 10000 + counts[0].val * 100 + (counts[1] ? counts[1].val * 10 : 0) + (counts[2] ? counts[2].val : 0); 
        name = "Pair"; 
        bestCards = [...valGroups[counts[0].val].map(c=>c.original).slice(0,2)];
    }
    else { 
        score = counts[0].val * 1000 + (counts[1] ? counts[1].val * 100 : 0) + (counts[2] ? counts[2].val * 10 : 0) + (counts[3] ? counts[3].val : 0); 
        name = "High Card"; 
        bestCards = [mapped[0].original];
    }
    
    return { score, name, bestCards };
}
