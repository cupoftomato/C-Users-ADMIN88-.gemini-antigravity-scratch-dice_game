function buildPokerDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    let deck = [];
    let idGen = 0;
    for (let s of suits) {
        deck.push(...values.map(v => ({ 
            id: idGen++, 
            suit: s, 
            value: v, 
            isRed: s === '♥' || s === '♦' 
        })));
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
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

class PokerGame {
    constructor(roomCode, buyIn, broadcastCallback, dbUpdateCallback) {
        this.roomCode = roomCode;
        this.buyIn = buyIn;
        this.broadcast = broadcastCallback;
        this.updateChips = dbUpdateCallback;
        
        this.players = []; // { socketId, username, chips, currentRoundBet, hasFolded, isAllIn, holeCards }
        this.deck = [];
        this.communityCards = [];
        this.pot = 0;
        this.highestBet = 0;
        this.stage = 0; // 0=PreFlop, 1=Flop, 2=Turn, 3=River, 4=Showdown
        this.turnIndex = 0;
        this.dealerIndex = 0;
        this.playersActedThisRound = 0;
        this.isRoundActive = false;
        this.actionLog = [];
    }
    
    addPlayer(socketId, username, startingChips) {
        this.players.push({
            socketId,
            username,
            chips: startingChips,
            currentRoundBet: 0,
            hasFolded: false,
            isAllIn: false,
            holeCards: [],
            isActive: true
        });
    }
    
    removePlayer(socketId) {
        const p = this.players.find(p => p.socketId === socketId);
        if (p) {
            p.isActive = false;
            p.hasFolded = true; // auto fold
        }
        this.checkWinCondition();
    }
    
    log(msg) {
        this.actionLog.push(msg);
        if (this.actionLog.length > 5) this.actionLog.shift();
    }

    startHand() {
        this.players = this.players.filter(p => p.isActive && p.chips > 0);
        if (this.players.length < 2) return this.log("Not enough players to start.");
        
        this.isRoundActive = true;
        this.deck = buildPokerDeck();
        this.communityCards = [];
        this.pot = 0;
        this.highestBet = 10; // Ante/BB
        this.stage = 0;
        this.actionLog = [];
        this.handWinners = [];
        
        this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
        this.turnIndex = (this.dealerIndex + 1) % this.players.length;
        this.playersActedThisRound = 0;
        
        this.log("Dealing new hand...");
        
        this.players.forEach(p => {
            p.hasFolded = false;
            p.isAllIn = false;
            p.currentRoundBet = 0;
            p.holeCards = [this.deck.pop(), this.deck.pop()];
            
            // Deduct Ante
            let ante = Math.min(10, p.chips);
            p.chips -= ante;
            p.currentRoundBet += ante;
            this.pot += ante;
            if (p.chips === 0) p.isAllIn = true;
        });
        
        this.sendState();
    }
    
    advanceTurn() {
        if (!this.isRoundActive) return;
        
        const activePlayers = this.players.filter(p => !p.hasFolded && !p.isAllIn);
        if (activePlayers.length <= 1 || this.playersActedThisRound >= activePlayers.length) {
            // Check if everyone called highest bet
            let allCalled = true;
            for (let p of activePlayers) {
                if (p.currentRoundBet < this.highestBet) allCalled = false;
            }
            if (allCalled) {
                this.nextStage();
                return;
            }
        }
        
        do {
            this.turnIndex = (this.turnIndex + 1) % this.players.length;
        } while (this.players[this.turnIndex].hasFolded || this.players[this.turnIndex].isAllIn);
        
        this.sendState();
    }
    
    checkWinCondition() {
        const notFolded = this.players.filter(p => !p.hasFolded);
        if (notFolded.length === 1) {
            this.isRoundActive = false;
            this.handWinners = [notFolded[0].socketId];
            this.log(`${notFolded[0].username} wins ${this.pot} (Everyone else folded)`);
            notFolded[0].chips += this.pot;
            
            setTimeout(() => this.startHand(), 4000);
            this.sendState();
            return true;
        }
        return false;
    }
    
    nextStage() {
        if (this.checkWinCondition()) return;
        
        this.stage++;
        this.playersActedThisRound = 0;
        this.highestBet = 0;
        this.players.forEach(p => p.currentRoundBet = 0);
        
        if (this.stage === 1) {
            this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
            this.log("Flop dealt.");
        } else if (this.stage === 2) {
            this.communityCards.push(this.deck.pop());
            this.log("Turn dealt.");
        } else if (this.stage === 3) {
            this.communityCards.push(this.deck.pop());
            this.log("River dealt.");
        } else if (this.stage === 4) {
            this.showdown();
            return;
        }
        
        this.turnIndex = this.dealerIndex;
        this.advanceTurn();
    }
    
    showdown() {
        this.isRoundActive = false;
        const activePlayers = this.players.filter(p => !p.hasFolded);
        let bestScore = -1;
        let winners = [];
        
        for (let p of activePlayers) {
            const ev = evaluateHand([...p.holeCards, ...this.communityCards]);
            p.evalName = ev.name;
            if (ev.score > bestScore) {
                bestScore = ev.score;
                winners = [p];
            } else if (ev.score === bestScore) {
                winners.push(p);
            }
        }
        
        this.handWinners = winners.map(w => w.socketId);
        
        const share = Math.floor(this.pot / winners.length);
        winners.forEach(w => {
            w.chips += share;
        });
        
        if (winners.length === 1) {
            this.log(`${winners[0].username} wins ${this.pot} with ${winners[0].evalName}!`);
        } else {
            this.log(`Split pot between ${winners.map(w=>w.username).join(', ')}!`);
        }
        
        this.sendState();
        setTimeout(() => this.startHand(), 5000);
    }
    
    handleAction(socketId, action, amount) {
        if (!this.isRoundActive) return;
        const p = this.players[this.turnIndex];
        if (p.socketId !== socketId) return;
        
        const callAmount = this.highestBet - p.currentRoundBet;
        
        if (action === 'fold') {
            p.hasFolded = true;
            this.log(`${p.username} folds.`);
        } else if (action === 'check') {
            if (callAmount > 0) return; // Cannot check if there's a bet
            this.log(`${p.username} checks.`);
        } else if (action === 'call') {
            let actualCall = Math.min(callAmount, p.chips);
            p.chips -= actualCall;
            p.currentRoundBet += actualCall;
            this.pot += actualCall;
            if (p.chips === 0) p.isAllIn = true;
            this.log(`${p.username} calls.`);
        } else if (action === 'raise') {
            let raiseAmt = Math.min(amount, p.chips - callAmount);
            if (raiseAmt <= 0) return; // Invalid raise
            
            const totalDeduct = callAmount + raiseAmt;
            p.chips -= totalDeduct;
            p.currentRoundBet += totalDeduct;
            this.pot += totalDeduct;
            this.highestBet = p.currentRoundBet;
            if (p.chips === 0) p.isAllIn = true;
            
            this.playersActedThisRound = 0; // reset
            this.log(`${p.username} raises ${raiseAmt}.`);
        }
        
        this.playersActedThisRound++;
        if (this.checkWinCondition()) return;
        this.advanceTurn();
    }
    
    sendState() {
        // We must sanitize the state before sending so players don't see each other's hole cards
        // unless it's a showdown!
        const isShowdown = this.stage === 4;
        
        const sanitizedPlayers = this.players.map(p => ({
            socketId: p.socketId,
            username: p.username,
            chips: p.chips,
            currentRoundBet: p.currentRoundBet,
            hasFolded: p.hasFolded,
            isAllIn: p.isAllIn,
            evalName: p.evalName,
            isActive: p.isActive,
            // Only send hole cards if showdown, OR if this is the player's own socket (handled in the broadcast map)
            holeCards: isShowdown ? p.holeCards : [] 
        }));
        
        // Broadcast custom payload to each player
        this.players.forEach(p => {
            const customPlayers = sanitizedPlayers.map(sp => {
                if (sp.socketId === p.socketId) {
                    return { ...sp, holeCards: p.holeCards };
                }
                return sp;
            });
            
            this.broadcast(p.socketId, 'poker_state_update', {
                roomCode: this.roomCode,
                pot: this.pot,
                highestBet: this.highestBet,
                stage: this.stage,
                communityCards: this.communityCards,
                turnSocketId: this.players[this.turnIndex].socketId,
                dealerSocketId: this.players[this.dealerIndex].socketId,
                isRoundActive: this.isRoundActive,
                handWinners: this.handWinners || [],
                actionLog: this.actionLog,
                players: customPlayers
            });
        });
    }
}

module.exports = { PokerGame };
