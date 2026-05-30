// --- NEON SLOTS LOGIC ---
const slotSymbols = ['🍒', '🍋', '🍇', '🍀', '🔔', '👑', '💎', '7', '🍅'];
const reelStrip1 = ['🍒', '🍒', '🍒', '🍒', '🍒', '🍒', '🍒', '🍀', '🍀', '🍀', '🍀', '🍀', '🍀', '🍀', '🍋', '🍋', '🔔', '🔔', '🍇', '🍇', '👑', '👑', '💎', '💎', '7', '7', '🍅'];
const reelStrip2 = ['🍋', '🍋', '🍋', '🍋', '🍋', '🍋', '🍋', '🔔', '🔔', '🔔', '🔔', '🔔', '🔔', '🔔', '🍒', '🍒', '🍀', '🍀', '🍇', '🍇', '👑', '👑', '💎', '💎', '7', '🍅'];
const reelStrip3 = ['🍇', '🍇', '🍇', '🍇', '🍇', '🍇', '🍇', '👑', '👑', '👑', '👑', '👑', '👑', '👑', '🍒', '🍒', '🍀', '🍀', '🍋', '🍋', '🔔', '🔔', '💎', '💎', '7', '🍅'];

let isSlotsSpinning = false;
let slotsSpinIntervals = [];

function synthesizeReelSpinSound() {
    try {
        const audioCtx = window.pokerAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        // Synthesize quick rising pitch whir
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(300, audioCtx.currentTime + 0.12);
        
        gain.gain.setValueAtTime(0.03 * (window.sfxVolume !== undefined ? window.sfxVolume : 0.8), audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.12);
    } catch (e) {}
}

function synthesizeReelStopSound(index) {
    try {
        const audioCtx = window.pokerAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        // Distinct bell tone for each reel stop (increasing pitch)
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        const frequencies = [440, 554, 659]; // A4, C#5, E5
        osc.frequency.setValueAtTime(frequencies[index], audioCtx.currentTime);
        
        gain.gain.setValueAtTime(0.05 * (window.sfxVolume !== undefined ? window.sfxVolume : 0.8), audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.18);
    } catch (e) {}
}

function synthesizeSlotsWinSound() {
    try {
        const audioCtx = window.pokerAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        // Play rapid success arpeggio
        const t = audioCtx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        
        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t + idx * 0.08);
            
            gain.gain.setValueAtTime(0.06 * (window.sfxVolume !== undefined ? window.sfxVolume : 0.8), t + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.2);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(t + idx * 0.08);
            osc.stop(t + idx * 0.08 + 0.2);
        });
    } catch (e) {}
}

function initSlotsGame() {
    document.getElementById('result-slots').classList.remove('show');
    document.getElementById('bg-flash').className = 'bg-flash';
    document.getElementById('reel-1').textContent = '💎';
    document.getElementById('reel-2').textContent = '💎';
    document.getElementById('reel-3').textContent = '💎';
    setupSlotsLever();
}

let isDraggingLever = false;
let leverStartY = 0;
let leverTriggered = false;

function setupSlotsLever() {
    let ball = document.getElementById('slots-lever-ball');
    let shaft = document.getElementById('slots-lever-shaft');
    if (!ball || !shaft) return;
    
    // Remove existing event listeners to avoid duplicates by cloning
    const clone = ball.cloneNode(true);
    ball.replaceWith(clone);
    ball = clone;
    
    // Reset styles
    shaft.style.height = '115px';
    ball.style.transform = 'scale(1)';
    
    const handleStart = (e) => {
        if (isSlotsSpinning) return;
        isDraggingLever = true;
        leverTriggered = false;
        leverStartY = e.touches ? e.touches[0].clientY : e.clientY;
        ball.style.cursor = 'grabbing';
        ball.style.transition = 'none';
        shaft.style.transition = 'none';
        
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('mouseup', handleEnd);
        window.addEventListener('touchend', handleEnd);
    };
    
    const handleMove = (e) => {
        if (!isDraggingLever) return;
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        let deltaY = currentY - leverStartY;
        
        // Clamp vertical pull distance between 0 and 120px
        deltaY = Math.max(0, Math.min(120, deltaY));
        
        // Foreshorten the shaft and scale up the ball to create 3D pulling forward effect
        shaft.style.height = `${115 - deltaY * 0.7}px`;
        ball.style.transform = `scale(${1 + (deltaY / 120) * 0.65})`;
        
        // Trigger threshold (90px pull down)
        if (deltaY >= 90 && !leverTriggered) {
            leverTriggered = true;
            // Play mechanical slot click
            try {
                const audioCtx = window.pokerAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(120, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.1 * window.sfxVolume, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.1);
            } catch (err) {}
        }
    };
    
    const handleEnd = () => {
        if (!isDraggingLever) return;
        isDraggingLever = false;
        ball.style.cursor = 'grab';
        
        // Animate lever springing back with a wobble bounce
        ball.style.transition = 'transform 0.45s cubic-bezier(0.25, 1.15, 0.35, 1.35)';
        shaft.style.transition = 'height 0.45s cubic-bezier(0.25, 1.15, 0.35, 1.35)';
        
        ball.style.transform = 'scale(1)';
        shaft.style.height = '115px';
        
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchend', handleEnd);
        
        if (leverTriggered) {
            spinSlots();
        }
    };
    
    ball.addEventListener('mousedown', handleStart);
    ball.addEventListener('touchstart', handleStart);
}

// Set up listeners on load
document.addEventListener('DOMContentLoaded', () => {
    setupSlotsLever();
});

function spinSlots() {
    if (isSlotsSpinning) return;
    
    const amountInput = document.getElementById('bet-amount-slots');
    const amount = parseInt(amountInput.value);
    
    if (globalPoints === 0) {
        if (amount !== 0) return alert("You have 0 chips. You can only place a bet of 0!");
    } else {
        if (isNaN(amount) || amount <= 0) return alert("Please enter a valid bet amount.");
        if (amount > globalPoints) return alert("You don't have enough chips!");
    }
    
    // Deduct chips
    globalPoints -= amount;
    updateGlobalStats();
    
    isSlotsSpinning = true;
    amountInput.disabled = true;
    document.getElementById('result-slots').classList.remove('show');
    document.getElementById('subtitle-slots').textContent = "Reels are spinning...";
    
    // Start rapid switching loop
    const reels = [
        document.getElementById('reel-1'),
        document.getElementById('reel-2'),
        document.getElementById('reel-3')
    ];
    
    // Spin sound loop ticker
    let soundTicker = 0;
    const spinIntervalTime = 60;
    
    reels.forEach((reel, idx) => {
        reel.style.filter = 'blur(4px)'; // Add speed blur
        slotsSpinIntervals[idx] = setInterval(() => {
            const randomSymbol = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
            if (randomSymbol === '7') {
                reel.innerHTML = '<span class="neon-seven">7</span>';
            } else {
                reel.textContent = randomSymbol;
            }
            
            // Play whirring sound on every second tick
            if (idx === 0 && soundTicker++ % 2 === 0) {
                synthesizeReelSpinSound();
            }
        }, spinIntervalTime);
    });
    
    // Generate final landing symbols from the respective reel strips
    let finalResult = [
        reelStrip1[Math.floor(Math.random() * reelStrip1.length)],
        reelStrip2[Math.floor(Math.random() * reelStrip2.length)],
        reelStrip3[Math.floor(Math.random() * reelStrip3.length)]
    ];
    
    // Staggered stop times
    const stopDelays = [1000, 1500, 2000];
    
    stopDelays.forEach((delay, idx) => {
        setTimeout(() => {
            clearInterval(slotsSpinIntervals[idx]);
            reels[idx].style.filter = 'none'; // Remove blur
            
            // Set final landing symbol
            const finalSymbol = finalResult[idx];
            if (finalSymbol === '7') {
                reels[idx].innerHTML = '<span class="neon-seven">7</span>';
            } else {
                reels[idx].textContent = finalSymbol;
            }
            
            synthesizeReelStopSound(idx);
            
            // If it's the last reel to stop, resolve the win
            if (idx === 2) {
                resolveSlots(amount);
            }
        }, delay);
    });
}

function resolveSlots(amount) {
    isSlotsSpinning = false;
    document.getElementById('bet-amount-slots').disabled = false;
    
    const r1 = document.getElementById('reel-1').textContent;
    const r2 = document.getElementById('reel-2').textContent;
    const r3 = document.getElementById('reel-3').textContent;
    
    let won = false;
    let multiplier = 0;
    let message = '';
    
    // Win logic
    if (r1 === r2 && r2 === r3) {
        // 3 of a kind
        won = true;
        const winningSymbol = r1;
        if (winningSymbol === '💎') { multiplier = 100; message = '💎 JACKPOT!!! 💎'; }
        else if (winningSymbol === '👑') { multiplier = 50; message = '👑 ROYAL CROWNS TRIPLE! 👑'; }
        else if (winningSymbol === '🍀') { multiplier = 20; message = '🍀 LUCKY CLOVERS TRIPLE! 🍀'; }
        else if (winningSymbol === '🔔') { multiplier = 20; message = '🔔 GOLDEN BELLS TRIPLE! 🔔'; }
        else if (winningSymbol === '7') { multiplier = 777; message = '🔥 777 SUPER JACKPOT!!! 🔥'; }
        else if (winningSymbol === '🍅') { multiplier = 1360; message = '🍅 TOMATO MEGA JACKPOT!!! 🍅'; }
        else { multiplier = 10; message = `${winningSymbol} TRIPLE!`; }
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
        // 2 matching symbols
        won = true;
        multiplier = 2;
        message = 'DOUBLE MATCH!';
    }
    
    const resultEl = document.getElementById('result-slots');
    resultEl.className = 'result show';
    
    if (won) {
        synthesizeSlotsWinSound();
        resultEl.textContent = `${message} YOU WIN!`;
        resultEl.className = 'result show thrift';
    } else {
        resultEl.textContent = 'NO MATCH. YOU LOSE.';
        resultEl.className = 'result show xyric';
    }
    
    processGameResult(won, amount, multiplier, 'subtitle-slots', '');
}
