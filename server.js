const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { PokerGame } = require('./poker_server.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const SECRET_KEY = "super_secret_poker_key_change_me_later";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve the frontend HTML/JS/CSS files

// Initialize SQLite Database
const path = require('path');
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'poker_database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error opening database at " + dbPath + ": " + err.message);
    } else {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            chips INTEGER DEFAULT 1000
        )`, (err) => {
            if (err) {
                console.error("Error creating users table:", err);
            } else {
                console.log("Users table ready.");
                db.run(`ALTER TABLE users ADD COLUMN savings INTEGER DEFAULT 0`, (err) => {
                    // Ignore error if column already exists
                });
            }
        });
    }
});

// --- API ROUTES ---

// 1. Register
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password, chips) VALUES (?, ?, ?)`, 
            [username, hashedPassword, 1000], 
            function(err) {
                if (err) {
                    if (err.message.includes("UNIQUE constraint failed")) {
                        return res.status(409).json({ error: "Username already exists" });
                    }
                    return res.status(500).json({ error: "Database error" });
                }
                res.status(201).json({ message: "Account created!", userId: this.lastID, chips: 1000 });
            }
        );
    } catch (e) {
        res.status(500).json({ error: "Server error" });
    }
});

// 2. Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });
    
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!user) return res.status(401).json({ error: "Invalid username or password" });
        
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: "Invalid username or password" });
        
        // Generate a token so the client can stay logged in and authenticate sockets later
        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
        
        res.json({ message: "Login successful", token, username: user.username, chips: user.chips, savings: user.savings || 0 });
    });
});

// 3. Admin: Give Points
app.post('/api/admin/add-chips', (req, res) => {
    const { targetUsername, amount } = req.body;
    
    // Check if the user exists
    db.get(`SELECT * FROM users WHERE username = ?`, [targetUsername], (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        
        if (!user) {
            // User doesn't exist, create them in database with default 1000 + amount
            const startingChips = 1000 + amount;
            db.run(`INSERT INTO users (username, password, chips) VALUES (?, ?, ?)`, 
                [targetUsername, '', startingChips], function(err) {
                    if (err) return res.status(500).json({ error: "Database error" });
                    
                    io.emit('chips_updated', { username: targetUsername, chips: startingChips });
                    const actionText = amount >= 0 ? `added ${amount} chips to` : `deducted ${Math.abs(amount)} chips from`;
                    res.json({ message: `Successfully ${actionText} new user ${targetUsername}!` });
                });
        } else {
            // User exists, update chips
            db.run(`UPDATE users SET chips = chips + ? WHERE username = ?`, [amount, targetUsername], function(err) {
                if (err) return res.status(500).json({ error: "Database error" });
                
                db.get(`SELECT chips FROM users WHERE username = ?`, [targetUsername], (err, row) => {
                    if (!err && row) {
                        io.emit('chips_updated', { username: targetUsername, chips: row.chips });
                    }
                });

                const actionText = amount >= 0 ? `added ${amount} chips to` : `deducted ${Math.abs(amount)} chips from`;
                res.json({ message: `Successfully ${actionText} ${targetUsername}!` });
            });
        }
    });
});

let thriftyState = {
    phase: 'betting', // 'betting' or 'reveal'
    timeLeft: 25,
    dice: [
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
    ],
    bets: {}, // socket.id -> { username, type, amount }
    history: [] // Last 10 rounds of dice sums
};

let globalChatHistory = [];
let pokerRooms = {};
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    } while (pokerRooms[code]);
    return code;
}

function getActiveRoomsSummary() {
    return Object.keys(pokerRooms).map(code => {
        const room = pokerRooms[code];
        return {
            code: code,
            hostName: room.players[0] ? room.players[0].username : 'Unknown',
            maxPlayers: room.maxPlayers,
            buyIn: room.buyIn,
            playersCount: room.players.length,
            isPrivate: room.isPrivate,
            state: room.state
        };
    });
}

function refundPlayerStack(room, socketId) {
    if (!room || room.state !== 'playing' || !room.game) return;
    const p = room.game.players.find(player => player.socketId === socketId && player.isActive);
    if (p && p.chips > 0) {
        const username = p.username;
        const chipsToRefund = p.chips;
        p.chips = 0; // prevent double refund
        p.isActive = false;
        
        db.run(`UPDATE users SET chips = chips + ? WHERE username = ?`, [chipsToRefund, username], (err) => {
            if (!err) {
                db.get(`SELECT chips FROM users WHERE username = ?`, [username], (err, row) => {
                    if (!err && row) {
                        io.emit('chips_updated', { username: username, chips: row.chips });
                    }
                });
            }
        });
    }
}

function refundAllPlayers(room) {
    if (!room || room.state !== 'playing' || !room.game) return;
    room.game.players.forEach(p => {
        if (p.isActive && p.chips > 0) {
            const username = p.username;
            const chipsToRefund = p.chips;
            p.chips = 0;
            p.isActive = false;
            
            db.run(`UPDATE users SET chips = chips + ? WHERE username = ?`, [chipsToRefund, username], (err) => {
                if (!err) {
                    db.get(`SELECT chips FROM users WHERE username = ?`, [username], (err, row) => {
                        if (!err && row) {
                            io.emit('chips_updated', { username: username, chips: row.chips });
                        }
                    });
                }
            });
        }
    });
}

function broadcastRoomsList() {
    io.emit('rooms_list_update', getActiveRoomsSummary());
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.join('Global');
    
    // Send current state immediately
    socket.emit('thrifty_sync', thriftyState);
    socket.emit('rooms_list_update', getActiveRoomsSummary());
    socket.emit('global_chat_history', globalChatHistory);

    socket.on('register_socket_user', (username) => {
        socket.username = username;
        if (username && username.toLowerCase() === 'cupoftomato') {
            socket.join('admin_channel');
        }
        db.get(`SELECT chips, savings FROM users WHERE username = ?`, [username], (err, row) => {
            if (!err && row) {
                socket.emit('sync_savings_data', { savings: row.savings || 0, chips: row.chips });
            }
        });
    });

    socket.on('deposit_savings', (data) => {
        const { username, amount } = data;
        if (!username || !amount || amount <= 0) return;
        db.get(`SELECT chips, savings FROM users WHERE username = ?`, [username], (err, row) => {
            if (err || !row) return;
            if (row.chips < amount) {
                socket.emit('savings_error', 'Not enough chips to deposit!');
                return;
            }
            const newChips = row.chips - amount;
            const newSavings = (row.savings || 0) + amount;
            db.run(`UPDATE users SET chips = ?, savings = ? WHERE username = ?`, [newChips, newSavings, username], (err) => {
                if (!err) {
                    io.emit('chips_updated', { username: username, chips: newChips });
                    socket.emit('sync_savings_data', { savings: newSavings, chips: newChips });
                }
            });
        });
    });

    socket.on('withdraw_savings', (data) => {
        const { username, amount } = data;
        if (!username || !amount || amount <= 0) return;
        db.get(`SELECT chips, savings FROM users WHERE username = ?`, [username], (err, row) => {
            if (err || !row) return;
            const currentSavings = row.savings || 0;
            if (currentSavings < amount) {
                socket.emit('savings_error', 'Not enough savings to withdraw!');
                return;
            }
            const newChips = row.chips + amount;
            const newSavings = currentSavings - amount;
            db.run(`UPDATE users SET chips = ?, savings = ? WHERE username = ?`, [newChips, newSavings, username], (err) => {
                if (!err) {
                    io.emit('chips_updated', { username: username, chips: newChips });
                    socket.emit('sync_savings_data', { savings: newSavings, chips: newChips });
                }
            });
        });
    });

    socket.on('toggle_thrifty_reveal', (data) => {
        if (data.username && data.username.toLowerCase() === 'cupoftomato') {
            socket.adminRevealEnabled = data.enabled;
            if (data.enabled) {
                socket.emit('admin_secret_dice', thriftyState.dice);
            }
        }
    });

    socket.on('request_online_players', () => {
        const onlineUsers = [];
        const sockets = io.sockets.sockets;
        sockets.forEach(s => {
            if (s.username) {
                onlineUsers.push(s.username);
            }
        });
        
        if (onlineUsers.length === 0) {
            socket.emit('online_players_data', []);
            return;
        }
        
        const placeholders = onlineUsers.map(() => '?').join(',');
        db.all(`SELECT username, chips, savings FROM users WHERE username IN (${placeholders})`, onlineUsers, (err, rows) => {
            if (err) {
                socket.emit('online_players_data', []);
            } else {
                const list = rows.map(row => ({
                    username: row.username,
                    chips: row.chips || 0,
                    savings: row.savings || 0
                }));
                socket.emit('online_players_data', list);
            }
        });
    });

    socket.on('transfer_chips', (data) => {
        const { sender, recipient, amount } = data;
        if (!sender || !recipient || amount <= 0) return;
        if (sender.toLowerCase() === recipient.toLowerCase()) {
            socket.emit('transfer_error', 'Cannot transfer to yourself.');
            return;
        }
        
        db.get(`SELECT chips FROM users WHERE username = ?`, [sender], (err, senderRow) => {
            if (err || !senderRow) {
                socket.emit('transfer_error', 'Sender not found.');
                return;
            }
            if (senderRow.chips < amount) {
                socket.emit('transfer_error', 'Not enough chips to transfer!');
                return;
            }
            
            db.get(`SELECT chips FROM users WHERE username = ?`, [recipient], (err, recipientRow) => {
                if (err || !recipientRow) {
                    socket.emit('transfer_error', 'Recipient player not found.');
                    return;
                }
                
                const newSenderChips = senderRow.chips - amount;
                const newRecipientChips = recipientRow.chips + amount;
                
                db.run(`UPDATE users SET chips = ? WHERE username = ?`, [newSenderChips, sender], (err) => {
                    if (err) return socket.emit('transfer_error', 'Database error during transaction.');
                    
                    db.run(`UPDATE users SET chips = ? WHERE username = ?`, [newRecipientChips, recipient], (err) => {
                        if (err) return socket.emit('transfer_error', 'Database error during transaction.');
                        
                        socket.emit('transfer_success', { amount, recipient, senderChips: newSenderChips });
                        
                        // Log transfer in the Global Chat for all players to see
                        const globalTransferMsg = {
                            username: 'System',
                            message: `💸 ${sender} transferred ${amount} chips to ${recipient}!`,
                            timestamp: Date.now(),
                            channel: 'Global'
                        };
                        globalChatHistory.push(globalTransferMsg);
                        if (globalChatHistory.length > 100) {
                            globalChatHistory.shift();
                        }
                        io.to('Global').emit('chat_message_receive', globalTransferMsg);
                        
                        const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.username && s.username.toLowerCase() === recipient.toLowerCase());
                        if (targetSocket) {
                            targetSocket.emit('chips_updated', { username: recipient, chips: newRecipientChips });
                        }
                    });
                });
            });
        });
    });

    socket.on('place_thrifty_bet', (data) => {
        if (thriftyState.phase !== 'betting') return;
        
        // In a real app, we'd verify JWT and deduct chips here.
        // For simplicity, we just register the bet.
        thriftyState.bets[socket.id] = {
            username: data.username,
            type: data.type,
            amount: data.amount,
            streak: data.streak || 0
        };

        // Broadcast bet notification to Thrifty chat
        io.to('Thrifty').emit('chat_message_receive', {
            username: 'System',
            message: `🤖 ${data.username} bet ${data.amount} chips on ${data.type.toUpperCase()}`,
            timestamp: Date.now(),
            channel: 'Thrifty'
        });
    });

    socket.on('place_roulette_bet', (data) => {
        let label = data.type === 'number' ? `Number ${data.number}` : data.type.toUpperCase();
        io.to('Roulette').emit('chat_message_receive', {
            username: 'System',
            message: `🤖 ${data.username} bet ${data.amount} chips on ${label}`,
            timestamp: Date.now(),
            channel: 'Roulette'
        });
    });
    
    // --- CHAT SYSTEM ---
    socket.on('join_chat_channel', (channelName) => {
        if (channelName === 'Global') return;
        if (socket.currentGameRoom && socket.currentGameRoom !== channelName) {
            socket.leave(socket.currentGameRoom);
        }
        socket.currentGameRoom = channelName;
        socket.join(channelName);
    });

    socket.on('chat_message', (data) => {
        const { channel, message, username } = data;
        if (!channel || !message || !username) return;
        const msg = {
            username: username,
            message: message,
            timestamp: Date.now(),
            channel: channel
        };
        if (channel === 'Global') {
            globalChatHistory.push(msg);
            if (globalChatHistory.length > 100) {
                globalChatHistory.shift();
            }
        }
        io.to(channel).emit('chat_message_receive', msg);
    });
    
    // --- POKER ROOMS ---
    socket.on('host_poker_room', (data) => {
        const code = generateRoomCode();
        pokerRooms[code] = {
            host: socket.id,
            maxPlayers: data.maxPlayers,
            buyIn: data.buyIn,
            players: [{ socketId: socket.id, username: data.username }],
            state: 'waiting',
            isPrivate: data.isPrivate === true
        };
        socket.join(code);
        socket.emit('room_created', { code, room: pokerRooms[code] });
        broadcastRoomsList();
    });

    socket.on('join_poker_room', (data) => {
        const code = data.code.toUpperCase();
        const room = pokerRooms[code];
        
        if (!room) return socket.emit('room_error', "Room not found.");
        if (room.state !== 'waiting') return socket.emit('room_error', "Game already in progress.");
        if (room.players.length >= room.maxPlayers) return socket.emit('room_error', "Room is full.");
        if (room.players.find(p => p.username === data.username)) return socket.emit('room_error', "You are already in this room.");
        
        room.players.push({ socketId: socket.id, username: data.username });
        socket.join(code);
        
        // Broadcast update to everyone in room
        io.to(code).emit('room_update', room);
        socket.emit('room_joined', { code, room });
        broadcastRoomsList();
    });
    
    socket.on('start_poker_game', (data) => {
        const code = data.code;
        const room = pokerRooms[code];
        if (!room || room.host !== socket.id) return;
        
        room.state = 'playing';
        io.to(code).emit('room_update', room);
        
        // Initialize Poker Game Engine
        room.game = new PokerGame(code, room.buyIn, 
            (targetSocketId, eventName, payload) => {
                io.to(targetSocketId).emit(eventName, payload);
            },
            (username, chipDelta) => {
                db.run(`UPDATE users SET chips = chips + ? WHERE username = ?`, [chipDelta, username]);
            }
        );
        
        room.players.forEach(p => {
            room.game.addPlayer(p.socketId, p.username, room.buyIn);
            // Deduct buy-in
            db.run(`UPDATE users SET chips = chips - ? WHERE username = ?`, [room.buyIn, p.username]);
        });
        
        room.game.startHand();
        broadcastRoomsList();
    });

    socket.on('poker_action', (data) => {
        const code = data.code;
        const room = pokerRooms[code];
        if (!room || !room.game) return;
        room.game.handleAction(socket.id, data.action, data.amount || 0);
    });

    socket.on('leave_poker_room', (data) => {
        const code = data.code;
        const room = pokerRooms[code];
        if (!room) return;
        
        if (room.host === socket.id) {
            refundAllPlayers(room);
            io.to(code).emit('room_destroyed', "The host left the room.");
            delete pokerRooms[code];
        } else {
            refundPlayerStack(room, socket.id);
            room.players = room.players.filter(p => p.socketId !== socket.id);
            if (room.game) room.game.removePlayer(socket.id);
            socket.leave(code);
            io.to(code).emit('room_update', room);
        }
        broadcastRoomsList();
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete thriftyState.bets[socket.id];
        
        let roomChanged = false;
        for (const code in pokerRooms) {
            const room = pokerRooms[code];
            if (room.host === socket.id) {
                refundAllPlayers(room);
                io.to(code).emit('room_destroyed', "The host disconnected.");
                delete pokerRooms[code];
                roomChanged = true;
            } else if (room.players.some(p => p.socketId === socket.id)) {
                refundPlayerStack(room, socket.id);
                room.players = room.players.filter(p => p.socketId !== socket.id);
                if (room.game) room.game.removePlayer(socket.id);
                io.to(code).emit('room_update', room);
                roomChanged = true;
            }
        }
        if (roomChanged) {
            broadcastRoomsList();
        }
    });

    // --- ADMIN COMMANDS ---
    socket.on('admin_set_chips', (data) => {
        db.run(`UPDATE users SET chips = ? WHERE username = ?`, [data.chips, data.username]);
    });
    
    socket.on('admin_give_chips', (data) => {
        db.run(`UPDATE users SET chips = chips + ? WHERE username = ?`, [data.amount, data.target]);
        io.emit('casino_broadcast', `Admin gifted ${data.amount} chips to ${data.target}!`);
    });
});

// Thrifty Game Loop
setInterval(() => {
    thriftyState.timeLeft--;
    
    if (thriftyState.timeLeft <= 0) {
        if (thriftyState.phase === 'betting') {
            // Transition to Reveal
            thriftyState.phase = 'reveal';
            thriftyState.timeLeft = 25;
            

            
            const sum = thriftyState.dice[0] + thriftyState.dice[1] + thriftyState.dice[2];
            
            // Add to history (keep last 10 rounds)
            thriftyState.history.push(sum);
            if (thriftyState.history.length > 10) {
                thriftyState.history.shift();
            }

            const winningType = sum >= 11 ? 'thrift' : 'xyric';
            
            // Payouts
            Object.keys(thriftyState.bets).forEach(socketId => {
                const bet = thriftyState.bets[socketId];
                if (bet.type === winningType) {
                    const winnings = bet.amount * 2;
                    db.get(`SELECT savings FROM users WHERE username = ?`, [bet.username], (err, userRow) => {
                        const savings = (userRow && userRow.savings) ? userRow.savings : 0;
                        const mult = 1 + (savings / 10000) * 0.005;
                        const finalWinnings = Math.round(winnings * mult);
                        
                        db.run(`UPDATE users SET chips = chips + ? WHERE username = ?`, [finalWinnings, bet.username], function(err) {
                            if (!err) {
                                db.get(`SELECT chips FROM users WHERE username = ?`, [bet.username], (err, row) => {
                                    if (!err && row) {
                                        io.emit('chips_updated', { username: bet.username, chips: row.chips });
                                    }
                                });
                            }
                        });
                        
                        if (finalWinnings > 500) {
                            io.emit('casino_broadcast', `🎉 ${bet.username} just won ${finalWinnings} chips in Thrifty!`);
                        }
                    });
                } else if (bet.amount > 500) {
                    io.emit('casino_broadcast', `💀 Ouch! ${bet.username} just lost ${bet.amount} chips in Thrifty.`);
                }
            });
            
            io.emit('thrifty_reveal', thriftyState.dice);
            
        } else {
            // Transition back to Betting
            thriftyState.phase = 'betting';
            thriftyState.timeLeft = 25;
            thriftyState.bets = {};
            thriftyState.dice = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];
            io.emit('thrifty_start_betting', thriftyState.timeLeft);
            
            // Auto turn off admin reveal for all sockets on new round
            const sockets = io.sockets.sockets;
            sockets.forEach(s => {
                if (s.adminRevealEnabled) {
                    s.adminRevealEnabled = false;
                }
            });
        }
    }
    
    // Tick
    const potSize = Object.values(thriftyState.bets).reduce((sum, bet) => sum + bet.amount, 0);
    io.emit('thrifty_tick', { phase: thriftyState.phase, timeLeft: thriftyState.timeLeft, pot: potSize });
    
}, 1000);

// Start the server
server.listen(PORT, () => {
    console.log(`Poker Backend Server is running on http://localhost:${PORT}`);
});
