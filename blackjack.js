// --- BLACKJACK LOGIC ---
let bjDeck = [];
let bjPlayerHand = [];
let bjDealerHand = [];
let bjBetAmount = 0;
let isBjGameActive = false;

function buildDeck() {
    const suits = ['♥', '♦', '♣', '♠'];
    const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    let deck = [];
    for (let s of suits) {
        for (let v of values) {
            deck.push({ suit: s, value: v, isRed: s === '♥' || s === '♦' });
        }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function calculateHand(hand) {
    let score = 0;
    let aces = 0;
    for (let card of hand) {
        if (['J', 'Q', 'K'].includes(card.value)) score += 10;
        else if (card.value === 'A') { score += 11; aces += 1; }
        else score += parseInt(card.value);
    }
    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }
    return score;
}

function renderCard(card, isHidden = false, animIndex = -1) {
    const el = document.createElement('div');
    el.className = `playing-card ${card.isRed ? 'red' : ''} ${isHidden ? 'hidden-card' : ''}`;
    if (animIndex >= 0) {
        el.classList.add('anim-deal');
        el.style.animationDelay = `${animIndex * 0.15}s`;
    }
    if (!isHidden) {
        el.setAttribute('data-value', card.value);
        el.textContent = card.suit;
    }
    return el;
}

function initBlackjackGame(isFirstLoad = false) {
    document.getElementById('reset-btn-blackjack').classList.remove('show');
    document.getElementById('result-blackjack').classList.remove('show');
    document.getElementById('bg-flash').className = 'bg-flash';
    document.getElementById('dealer-cards').innerHTML = '';
    document.getElementById('player-cards').innerHTML = '';
    document.getElementById('dealer-score').textContent = '?';
    document.getElementById('player-score').textContent = '0';
    document.getElementById('bj-actions').style.display = 'none';
    
    if (globalPoints >= 0) {
        document.getElementById('bet-amount-blackjack').disabled = false;
        document.getElementById('bet-play-bj').disabled = false;
        document.getElementById('subtitle-blackjack').textContent = 'Place your bet to play against the Bot!';
    }
    
    document.getElementById('table-blackjack').style.opacity = '0.5';
    document.getElementById('table-blackjack').style.pointerEvents = 'none';
    isBjGameActive = false;
}

function placeBetBlackjack() {
    const amount = parseInt(document.getElementById('bet-amount-blackjack').value);
    if (globalPoints === 0) {
        if (amount !== 0) return alert("You have 0 chips. You can only place a bet of 0!");
    } else {
        if (isNaN(amount) || amount <= 0) return alert("Please enter a valid bet amount.");
        if (amount > globalPoints) return alert("You don't have enough chips!");
    }
    
    bjBetAmount = amount;
    globalPoints -= amount;
    updateGlobalStats();
    
    document.getElementById('bet-amount-blackjack').disabled = true;
    document.getElementById('bet-play-bj').disabled = true;
    document.getElementById('subtitle-blackjack').textContent = `Dealer is shuffling...`;
    
    document.getElementById('deck-blackjack').classList.add('shuffling');
    
    setTimeout(() => {
        document.getElementById('deck-blackjack').classList.remove('shuffling');
        document.getElementById('subtitle-blackjack').textContent = `Bet placed: ${amount}. Good luck!`;
        
        document.getElementById('table-blackjack').style.opacity = '1';
        document.getElementById('table-blackjack').style.pointerEvents = 'auto';
        
        startBlackjackRound();
    }, 2000);
}

function startBlackjackRound() {
    bjDeck = buildDeck();
    
    // SECRET RIGGING SYSTEM: 2% chance to force a Blackjack for the player if streak >= 3
    if (globalWinStreak >= 3 && Math.random() < 0.02) {
        bjPlayerHand = [
            { suit: '♠', value: 'A', isRed: false },
            { suit: '♥', value: 'K', isRed: true }
        ];
        bjDealerHand = [
            { suit: '♣', value: '7', isRed: false },
            { suit: '♦', value: '8', isRed: true }
        ];
    } else {
        bjPlayerHand = [bjDeck.pop(), bjDeck.pop()];
        bjDealerHand = [bjDeck.pop(), bjDeck.pop()];
    }
    
    isBjGameActive = true;
    
    updateBlackjackUI(true);
    document.getElementById('bj-actions').style.display = 'flex';
    
    if (calculateHand(bjPlayerHand) === 21) {
        // Player Blackjack
        endBlackjackRound();
    }
}

function updateBlackjackUI(hideDealerCard = false) {
    triggerDealerAnimation('bot-bj');
    const pContainer = document.getElementById('player-cards');
    const dContainer = document.getElementById('dealer-cards');
    
    let oldPlayerLength = pContainer.children.length;
    let oldDealerLength = dContainer.children.length;
    
    pContainer.innerHTML = '';
    dContainer.innerHTML = '';
    
    let baseAnimIndex = 0;
    
    bjPlayerHand.forEach((card, idx) => {
        let animIndex = -1;
        if (idx >= oldPlayerLength) {
            animIndex = baseAnimIndex++;
        }
        pContainer.appendChild(renderCard(card, false, animIndex));
    });
    
    bjDealerHand.forEach((card, index) => {
        let animIndex = -1;
        if (index >= oldDealerLength) {
            animIndex = baseAnimIndex++;
        }
        if (index === 1 && hideDealerCard) dContainer.appendChild(renderCard(card, true, animIndex));
        else dContainer.appendChild(renderCard(card, false, animIndex));
    });
    
    document.getElementById('player-score').textContent = calculateHand(bjPlayerHand);
    
    if (hideDealerCard) {
        const upCardValue = calculateHand([bjDealerHand[0]]);
        document.getElementById('dealer-score').textContent = upCardValue;
    } else {
        document.getElementById('dealer-score').textContent = calculateHand(bjDealerHand);
    }
}

function hitBlackjack() {
    if (!isBjGameActive) return;
    bjPlayerHand.push(bjDeck.pop());
    updateBlackjackUI(true);
    
    if (calculateHand(bjPlayerHand) > 21) {
        endBlackjackRound(); // Bust
    }
}

function standBlackjack() {
    if (!isBjGameActive) return;
    document.getElementById('bj-actions').style.display = 'none';
    
    updateBlackjackUI(false);
    
    let dealerInterval = setInterval(() => {
        if (calculateHand(bjDealerHand) < 17) {
            bjDealerHand.push(bjDeck.pop());
            updateBlackjackUI(false);
        } else {
            clearInterval(dealerInterval);
            endBlackjackRound();
        }
    }, 800);
}

function endBlackjackRound() {
    isBjGameActive = false;
    document.getElementById('bj-actions').style.display = 'none';
    updateBlackjackUI(false);
    
    const pScore = calculateHand(bjPlayerHand);
    const dScore = calculateHand(bjDealerHand);
    
    const resultElement = document.getElementById('result-blackjack');
    resultElement.className = 'result show';
    
    let won = false;
    let push = false;
    let multiplier = 2; // Normal win returns 2x bet
    
    if (pScore > 21) {
        resultElement.textContent = "BUST! YOU LOSE";
        resultElement.classList.add('xyric');
    } else if (dScore > 21) {
        resultElement.textContent = "DEALER BUSTS! YOU WIN";
        resultElement.classList.add('thrift');
        won = true;
    } else if (pScore > dScore) {
        resultElement.textContent = "YOU WIN!";
        resultElement.classList.add('thrift');
        if (pScore === 21 && bjPlayerHand.length === 2) {
            resultElement.textContent = "BLACKJACK!";
            multiplier = 2.5; // 3:2 payout roughly
        }
        won = true;
    } else if (pScore < dScore) {
        resultElement.textContent = "DEALER WINS!";
        resultElement.classList.add('xyric');
    } else {
        resultElement.textContent = "PUSH (TIE)";
        push = true;
    }
    
    if (push) {
        globalPoints += bjBetAmount;
        document.getElementById('subtitle-blackjack').textContent = `Push! Your bet of ${bjBetAmount} was returned.`;
        updateGlobalStats();
        document.getElementById('reset-btn-blackjack').classList.add('show');
    } else {
        processGameResult(won, bjBetAmount, multiplier, 'subtitle-blackjack', 'reset-btn-blackjack');
    }
}
