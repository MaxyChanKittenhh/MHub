const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const sqlite3 = require('sqlite3').verbose();
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize SQLite database
const db = new sqlite3.Database('./meteorhub.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT UNIQUE,
    username TEXT,
    avatar TEXT,
    discriminator TEXT,
    access_token TEXT,
    refresh_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id TEXT,
    author_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    user_name TEXT,
    user_avatar TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER,
    sender_id TEXT,
    sender_name TEXT,
    sender_avatar TEXT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(ticket_id) REFERENCES tickets(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    product_id TEXT,
    rating INTEGER CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
  )`);
});

// Passport Discord Strategy
passport.use(new DiscordStrategy(config.discord,
  async (accessToken, refreshToken, profile, done) => {
    db.get('SELECT * FROM users WHERE discord_id = ?', [profile.id], (err, row) => {
      if (err) return done(err);
      if (row) {
        db.run('UPDATE users SET username = ?, avatar = ?, access_token = ?, refresh_token = ? WHERE discord_id = ?',
          [profile.username, profile.avatar, accessToken, refreshToken, profile.id]);
        return done(null, { ...row, username: profile.username, avatar: profile.avatar });
      } else {
        db.run('INSERT INTO users (discord_id, username, avatar, discriminator, access_token, refresh_token) VALUES (?, ?, ?, ?, ?, ?)',
          [profile.id, profile.username, profile.avatar, profile.discriminator, accessToken, refreshToken],
          function(err) {
            if (err) return done(err);
            done(null, { id: this.lastID, discord_id: profile.id, username: profile.username, avatar: profile.avatar });
          });
      }
    });
  }
));

passport.serializeUser((user, done) => done(null, user.discord_id));
passport.deserializeUser((id, done) => {
  db.get('SELECT * FROM users WHERE discord_id = ?', [id], (err, row) => done(err, row));
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 604800000 } // 7 days
}));
app.use(passport.initialize());
app.use(passport.session());

// Auth middleware
const ensureAuth = (req, res, next) => req.isAuthenticated() ? next() : res.status(401).json({ error: 'Unauthorized' });
const ensureAdmin = (req, res, next) => {
  if (req.isAuthenticated() && (config.adminIds.includes(req.user.discord_id) || req.user.discord_id === config.ownerId)) {
    return next();
  }
  res.status(403).json({ error: 'Forbidden' });
};

// Auth Routes
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/auth/logout', (req, res) => { req.logout(() => res.redirect('/')); });
app.get('/api/user', (req, res) => {
  if (!req.isAuthenticated()) return res.json(null);
  const isAdmin = config.adminIds.includes(req.user.discord_id) || req.user.discord_id === config.ownerId;
  res.json({ ...req.user, isAdmin, isOwner: req.user.discord_id === config.ownerId });
});

// Products & Links
app.get('/api/products', (req, res) => res.json(config.products));
app.get('/api/links', (req, res) => res.json(config.links));

// Announcements
app.get('/api/announcements', (req, res) => {
  db.all('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 20', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/announcements', ensureAdmin, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
  db.run('INSERT INTO announcements (title, content, author_id, author_name) VALUES (?, ?, ?, ?)',
    [title, content, req.user.discord_id, req.user.username],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, title, content, author_id: req.user.discord_id, author_name: req.user.username, created_at: new Date().toISOString() });
    });
});

// Ratings
app.get('/api/ratings/:productId', (req, res) => {
  db.get('SELECT AVG(rating) as average, COUNT(*) as count FROM ratings WHERE product_id = ?', [req.params.productId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ average: row.average ? parseFloat(row.average).toFixed(1) : 0, count: row.count });
  });
});

app.post('/api/ratings', ensureAuth, (req, res) => {
  const { productId, rating, comment } = req.body;
  if (!productId || !rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Invalid rating' });
  db.run('INSERT OR REPLACE INTO ratings (user_id, product_id, rating, comment) VALUES (?, ?, ?, ?)',
    [req.user.discord_id, productId, rating, comment || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
});

// Tickets
app.get('/api/tickets', ensureAuth, (req, res) => {
  const query = req.user.discord_id === config.ownerId || config.adminIds.includes(req.user.discord_id)
    ? 'SELECT * FROM tickets ORDER BY updated_at DESC'
    : 'SELECT * FROM tickets WHERE user_id = ? ORDER BY updated_at DESC';
  const params = query.includes('?') ? [req.user.discord_id] : [];
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/tickets', ensureAuth, (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Title and description required' });
  db.run('INSERT INTO tickets (user_id, user_name, user_avatar, title, description) VALUES (?, ?, ?, ?, ?)',
    [req.user.discord_id, req.user.username, req.user.avatar, title, description],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, user_id: req.user.discord_id, title, description, status: 'open', created_at: new Date().toISOString() });
    });
});

app.put('/api/tickets/:id', ensureAdmin, (req, res) => {
  const { status } = req.body;
  db.run('UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Messages
app.get('/api/tickets/:id/messages', ensureAuth, (req, res) => {
  db.get('SELECT * FROM tickets WHERE id = ?', [req.params.id], (err, ticket) => {
    if (err || !ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.user_id !== req.user.discord_id && !config.adminIds.includes(req.user.discord_id) && req.user.discord_id !== config.ownerId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.all('SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at ASC', [req.params.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
});

app.post('/api/tickets/:id/messages', ensureAuth, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  db.get('SELECT * FROM tickets WHERE id = ?', [req.params.id], (err, ticket) => {
    if (err || !ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.user_id !== req.user.discord_id && !config.adminIds.includes(req.user.discord_id) && req.user.discord_id !== config.ownerId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    db.run('INSERT INTO messages (ticket_id, sender_id, sender_name, sender_avatar, content) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, req.user.discord_id, req.user.username, req.user.avatar, content],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const msg = { id: this.lastID, ticket_id: parseInt(req.params.id), sender_id: req.user.discord_id, sender_name: req.user.username, sender_avatar: req.user.avatar, content, created_at: new Date().toISOString() };
        // Broadcast to WebSocket clients in this ticket room
        broadcastToTicket(req.params.id, { type: 'message', data: msg });
        res.json(msg);
      });
  });
});

// WebSocket Live Chat
const clients = new Map();
wss.on('connection', (ws, req) => {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'join_ticket') {
        ws.ticketId = msg.ticketId;
        ws.userId = msg.userId;
      }
      if (msg.type === 'typing') {
        broadcastToTicket(ws.ticketId, { type: 'typing', userId: msg.userId, userName: msg.userName }, ws);
      }
    } catch (e) {}
  });
  ws.on('close', () => clients.delete(ws));
});

function broadcastToTicket(ticketId, data, excludeWs = null) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.ticketId === String(ticketId) && client !== excludeWs) {
      client.send(JSON.stringify(data));
    }
  });
}

server.listen(config.port, () => {
  console.log(`Meteor Hub server running on port ${config.port}`);
});
