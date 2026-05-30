// --- ROULETTE LOGIC ---
const rouletteNumbers = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const rouletteReds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const rouletteBlacks = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

let selectedRouletteBetType = ''; // 'red', 'black', 'green', 'even', 'odd', 'low', 'high', 'number'
let rouletteSpinAngle = 0;
let rouletteVelocity = 0;
let isRouletteSpinning = false;

// Timed loop states
let roulettePhase = 'betting'; // 'betting' or 'reveal'
let rouletteTimeLeft = 60;
let rouletteActiveBets = []; // list of { type, amount, numberVal }
let rouletteInterval = null;

function isNumberMatchingBet(num, betType) {
    if (!betType) return false;
    if (betType === 'red') return rouletteReds.includes(num);
    if (betType === 'black') return rouletteBlacks.includes(num);
    if (betType === 'green') return num === 0;
    if (betType === 'even') return num !== 0 && num % 2 === 0;
    if (betType === 'odd') return num !== 0 && num % 2 !== 0;
    if (betType === 'low') return num >= 1 && num <= 18;
    if (betType === 'high') return num >= 19 && num <= 36;
    if (betType === 'number') {
        const inputVal = parseInt(document.getElementById('bet-roulette-number')?.value);
        return num === inputVal;
    }
    return false;
}

function selectRouletteBet(type) {
    if (roulettePhase !== 'betting' || isRouletteSpinning) return;
    selectedRouletteBetType = type;
    
    // Reset all buttons active style
    document.querySelectorAll('.roulette-board button').forEach(btn => {
        btn.classList.remove('active-bet');
        btn.style.borderColor = '';
    });

    const statusEl = document.getElementById('roulette-bet-status');
    const numInput = document.getElementById('bet-roulette-number');

    if (type !== 'number') {
        numInput.value = '';
        const btn = document.getElementById(`bet-roulette-${type}`);
        if (btn) {
            btn.classList.add('active-bet');
        }
        statusEl.textContent = `Selected Bet Type: ${type.toUpperCase()}`;
    } else {
        numInput.focus();
        statusEl.textContent = `Selected Bet Type: Number (Enter 0-36 below)`;
    }
    
    // Highlight wheel slices
    drawRouletteWheel();
}

// Watch number input focus to select number bet automatically
document.addEventListener('DOMContentLoaded', () => {
    const numInput = document.getElementById('bet-roulette-number');
    if (numInput) {
        numInput.addEventListener('input', () => {
            selectRouletteBet('number');
            const val = parseInt(numInput.value);
            const statusEl = document.getElementById('roulette-bet-status');
            if (!isNaN(val) && val >= 0 && val <= 36) {
                statusEl.textContent = `Selected Bet: Number ${val}`;
            }
            drawRouletteWheel();
        });
    }
    startRouletteLoop();
});

function drawRouletteWheel() {
    const canvas = document.getElementById('roulette-wheel');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 10;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const sliceAngle = (2 * Math.PI) / rouletteNumbers.length;
    
    // Draw outer wooden ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#451a03'; // Wood tone
    ctx.stroke();
    
    // Draw inner gold border
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 7, 0, 2 * Math.PI);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fbbf24';
    ctx.stroke();

    for (let i = 0; i < rouletteNumbers.length; i++) {
        const num = rouletteNumbers[i];
        const startAngle = rouletteSpinAngle + i * sliceAngle;
        const endAngle = startAngle + sliceAngle;
        
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius - 8, startAngle, endAngle);
        ctx.closePath();
        
        // Fill slot color
        if (num === 0) {
            ctx.fillStyle = '#10b981'; // Green 0
        } else if (rouletteReds.includes(num)) {
            ctx.fillStyle = '#ef4444'; // Red
        } else {
            ctx.fillStyle = '#1e293b'; // Black / Dark slate
        }
        ctx.fill();
        
        // Slice border lines
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (radius - 8) * Math.cos(startAngle), cy + (radius - 8) * Math.sin(startAngle));
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.stroke();
        

        
        // Draw Number Text
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(startAngle + sliceAngle / 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(num, radius - 24, 0);
        ctx.restore();
    }
    
    // Draw center turret/spindle
    ctx.beginPath();
    ctx.arc(cx, cy, 35, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 25, 0, 2 * Math.PI);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Center decorative handle
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
}

function synthesizeWheelClack() {
    if (typeof activeGame !== 'undefined' && activeGame !== 'roulette') return;
    try {
        const audioCtx = window.pokerAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        // Custom synthesized click sound
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
        
        // Quick decay
        gain.gain.setValueAtTime(0.08 * (window.sfxVolume !== undefined ? window.sfxVolume : 0.8), audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    } catch (e) {
        console.error("Audio synthesis error:", e);
    }
}

function startRouletteLoop() {
    if (rouletteInterval) return;
    
    rouletteInterval = setInterval(() => {
        rouletteTimeLeft--;
        
        const timerEl = document.getElementById('roulette-timer');
        const phaseEl = document.getElementById('roulette-phase-text');
        
        if (timerEl) timerEl.textContent = rouletteTimeLeft;
        if (phaseEl) {
            phaseEl.textContent = roulettePhase.toUpperCase();
            phaseEl.style.color = roulettePhase === 'betting' ? '#34d399' : '#f87171';
        }
        
        if (rouletteTimeLeft <= 0) {
            if (roulettePhase === 'betting') {
                // Transition to Reveal
                roulettePhase = 'reveal';
                rouletteTimeLeft = 15;
                
                // Disable controls
                disableRouletteControls(true);
                
                // Trigger auto-spin
                spinRoulette();
            } else {
                // Transition back to Betting
                roulettePhase = 'betting';
                rouletteTimeLeft = 60;
                
                // Clear active bets
                rouletteActiveBets = [];
                updateActiveBetsList();
                
                // Enable controls
                disableRouletteControls(false);
                
                // Reset status indicators
                const resultEl = document.getElementById('result-roulette');
                if (resultEl) {
                    resultEl.classList.remove('show');
                    resultEl.textContent = '';
                }
                const subEl = document.getElementById('subtitle-roulette');
                if (subEl) subEl.textContent = "Place multiple bets and watch the wheel spin!";
                const statusEl = document.getElementById('roulette-bet-status');
                if (statusEl) statusEl.textContent = 'No bet selected';
                
                document.getElementById('bg-flash').className = 'bg-flash';
            }
        }
    }, 1000);
}

function disableRouletteControls(disable) {
    const amountInput = document.getElementById('bet-amount-roulette');
    const numInput = document.getElementById('bet-roulette-number');
    const placeBtn = document.getElementById('btn-spin-roulette');
    
    if (amountInput) amountInput.disabled = disable;
    if (numInput) numInput.disabled = disable;
    if (placeBtn) placeBtn.disabled = disable;
}

function initRouletteGame() {
    const resultEl = document.getElementById('result-roulette');
    if (resultEl) resultEl.classList.remove('show');
    document.getElementById('bg-flash').className = 'bg-flash';
    
    disableRouletteControls(roulettePhase === 'reveal');
    updateActiveBetsList();
    
    const timerEl = document.getElementById('roulette-timer');
    const phaseEl = document.getElementById('roulette-phase-text');
    if (timerEl) timerEl.textContent = rouletteTimeLeft;
    if (phaseEl) {
        phaseEl.textContent = roulettePhase.toUpperCase();
        phaseEl.style.color = roulettePhase === 'betting' ? '#34d399' : '#f87171';
    }
    
    drawRouletteWheel();
}

function placeRouletteBetClick() {
    if (roulettePhase !== 'betting') {
        alert("Bets can only be placed during the Betting Phase!");
        return;
    }
    
    const amountInput = document.getElementById('bet-amount-roulette');
    const amount = parseInt(amountInput.value);
    
    if (globalPoints === 0) {
        if (amount !== 0) return alert("You have 0 chips. You can only place a bet of 0!");
    } else {
        if (isNaN(amount) || amount <= 0) return alert("Please enter a valid bet amount.");
        if (amount > globalPoints) return alert("You don't have enough chips!");
    }
    if (!selectedRouletteBetType) return alert("Please select a bet type first (e.g. Red, Even, or a Number)!");
    
    let targetNum = null;
    if (selectedRouletteBetType === 'number') {
        targetNum = parseInt(document.getElementById('bet-roulette-number').value);
        if (isNaN(targetNum) || targetNum < 0 || targetNum > 36) {
            return alert("Please enter a valid number bet between 0 and 36.");
        }
    }
    
    // Deduct points immediately
    globalPoints -= amount;
    updateGlobalStats();
    
    // Register bet
    rouletteActiveBets.push({
        type: selectedRouletteBetType,
        amount: amount,
        number: targetNum
    });
    
    // Emit roulette bet event to server for bet log
    if (typeof socket !== 'undefined' && socket) {
        const user = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : 'Guest';
        socket.emit('place_roulette_bet', {
            username: user,
            type: selectedRouletteBetType,
            amount: amount,
            number: targetNum
        });
    }
    
    updateActiveBetsList();
}

function updateActiveBetsList() {
    const listEl = document.getElementById('roulette-active-bets-list');
    if (!listEl) return;
    
    if (rouletteActiveBets.length === 0) {
        listEl.textContent = 'None';
        return;
    }
    
    listEl.innerHTML = '';
    rouletteActiveBets.forEach((bet, idx) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justify = 'space-between';
        div.style.borderBottom = '1px dashed rgba(255,255,255,0.05)';
        div.style.paddingBottom = '3px';
        
        const label = bet.type === 'number' ? `Number ${bet.number}` : bet.type.toUpperCase();
        div.innerHTML = `<span>#${idx + 1}. ${label}</span> <span class="gold-text">${bet.amount} chips</span>`;
        listEl.appendChild(div);
    });
}

function spinRoulette() {
    if (isRouletteSpinning) return;
    
    isRouletteSpinning = true;
    const subEl = document.getElementById('subtitle-roulette');
    if (subEl) subEl.textContent = "Wheel is spinning... Good luck!";
    
    const resultEl = document.getElementById('result-roulette');
    if (resultEl) resultEl.classList.remove('show');
    
    // Physics parameters
    rouletteVelocity = 0.35 + Math.random() * 0.15; // Initial angular speed
    const friction = 0.985 + Math.random() * 0.004; // Random friction rate
    
    let lastClackAngle = 0;
    const sliceAngle = (2 * Math.PI) / rouletteNumbers.length;
    
    function animate() {
        if (rouletteVelocity < 0.0005) {
            resolveRoulette();
            return;
        }
        
        rouletteSpinAngle += rouletteVelocity;
        rouletteVelocity *= friction;
        
        // Trigger clack sound as each slot passes the pointer
        const progressAngle = rouletteSpinAngle % (2 * Math.PI);
        const slotsPassed = Math.floor(progressAngle / sliceAngle);
        const lastSlotsPassed = Math.floor(lastClackAngle / sliceAngle);
        if (slotsPassed !== lastSlotsPassed) {
            synthesizeWheelClack();
            lastClackAngle = progressAngle;
        }
        
        drawRouletteWheel();
        requestAnimationFrame(animate);
    }
    
    animate();
}

function resolveRoulette() {
    isRouletteSpinning = false;
    
    // European roulette pointer is at the very top (angle = -Math.PI / 2)
    const pointerAngle = -Math.PI / 2;
    const sliceAngle = (2 * Math.PI) / rouletteNumbers.length;
    
    // Landed slice calculation
    let relativeAngle = pointerAngle - rouletteSpinAngle;
    while (relativeAngle < 0) relativeAngle += 2 * Math.PI;
    const landedIndex = Math.floor((relativeAngle % (2 * Math.PI)) / sliceAngle);
    const winningNum = rouletteNumbers[landedIndex];
    
    const isRed = rouletteReds.includes(winningNum);
    const isBlack = rouletteBlacks.includes(winningNum);
    const isEven = winningNum !== 0 && winningNum % 2 === 0;
    const isOdd = winningNum !== 0 && winningNum % 2 !== 0;
    const isLow = winningNum >= 1 && winningNum <= 18;
    const isHigh = winningNum >= 19 && winningNum <= 36;
    
    const colorText = winningNum === 0 ? 'GREEN' : (isRed ? 'RED' : 'BLACK');
    
    let totalBet = 0;
    let totalWon = 0;
    
    rouletteActiveBets.forEach(bet => {
        totalBet += bet.amount;
        let won = false;
        let multiplier = 2; // Returns 2x (bet + 1x winnings)
        
        if (bet.type === 'red' && isRed) won = true;
        else if (bet.type === 'black' && isBlack) won = true;
        else if (bet.type === 'green' && winningNum === 0) { won = true; multiplier = 36; }
        else if (bet.type === 'even' && isEven) won = true;
        else if (bet.type === 'odd' && isOdd) won = true;
        else if (bet.type === 'low' && isLow) won = true;
        else if (bet.type === 'high' && isHigh) won = true;
        else if (bet.type === 'number' && winningNum === bet.number) { won = true; multiplier = 36; }
        
        if (won) {
            totalWon += bet.amount * multiplier;
        }
    });
    
    const resultEl = document.getElementById('result-roulette');
    if (!resultEl) return;
    
    resultEl.className = 'result show';
    
    // Add won chips to globalPoints
    if (totalWon > 0) {
        const earningsMult = 1 + (globalSavings / 10000) * 0.005;
        totalWon = Math.round(totalWon * earningsMult);
        globalPoints += totalWon;
        updateGlobalStats();
    }
    
    const netWin = totalWon - totalBet;
    
    if (totalBet === 0) {
        resultEl.textContent = `Landed on ${winningNum} (${colorText}). No bets placed.`;
        resultEl.className = 'result show';
        const subEl = document.getElementById('subtitle-roulette');
        if (subEl) subEl.textContent = `Landed on ${winningNum} (${colorText}).`;
    } else if (netWin >= 0) {
        resultEl.textContent = `Landed on ${winningNum} (${colorText})! Net: +${netWin} chips.`;
        resultEl.className = 'result show thrift';
        processGameResult(true, totalBet, totalWon / totalBet, 'subtitle-roulette', '', true);
    } else {
        resultEl.textContent = `Landed on ${winningNum} (${colorText}). Net: -${Math.abs(netWin)} chips.`;
        resultEl.className = 'result show xyric';
        processGameResult(false, totalBet, 0, 'subtitle-roulette', '', true);
    }
}
