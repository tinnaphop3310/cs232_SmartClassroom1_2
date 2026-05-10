const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-deploying';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
  }
}

function readDb() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeDb(db) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function ensureUserData(user) {
  user.friends = Array.isArray(user.friends) ? user.friends : [];
  user.friendRequests = Array.isArray(user.friendRequests) ? user.friendRequests : [];
  user.sentFriendRequests = Array.isArray(user.sentFriendRequests) ? user.sentFriendRequests : [];
  user.groupInvites = Array.isArray(user.groupInvites) ? user.groupInvites : [];
  user.tasks = Array.isArray(user.tasks) ? user.tasks : [];
  user.tagColors = user.tagColors || {};
  return user;
}

function publicUser(user) {
  const safe = ensureUserData({ ...user });
  delete safe.passwordHash;
  delete safe.password;
  return safe;
}

function publicUsers(db) {
  return Object.fromEntries(
    Object.entries(db.users || {}).map(([email, user]) => [email, publicUser(user)])
  );
}

function signToken(email) {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userEmail = normalizeEmail(payload.email);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Please login again.' });
  }
}

app.post('/api/auth/register', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim();

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const db = readDb();
  if (db.users[email]) return res.status(409).json({ error: 'This email already has an account. Please login instead.' });

  db.users[email] = ensureUserData({
    email,
    name: name || email.split('@')[0],
    passwordHash: await bcrypt.hash(password, 10),
    tasks: [],
    tagColors: {},
    friends: [],
    friendRequests: [],
    sentFriendRequests: [],
    groupInvites: []
  });
  writeDb(db);

  res.status(201).json({
    token: signToken(email),
    email,
    users: publicUsers(db)
  });
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const db = readDb();
  const user = db.users[email];

  if (!user || !(await bcrypt.compare(password, user.passwordHash || ''))) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  res.json({
    token: signToken(email),
    email,
    users: publicUsers(db)
  });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const db = readDb();
  if (!db.users[req.userEmail]) return res.status(404).json({ error: 'Account not found.' });
  res.json({ email: req.userEmail, users: publicUsers(db) });
});

app.put('/api/users/state', authRequired, (req, res) => {
  const incomingUsers = req.body.users;
  if (!incomingUsers || typeof incomingUsers !== 'object') {
    return res.status(400).json({ error: 'Invalid user state.' });
  }

  const db = readDb();
  Object.entries(incomingUsers).forEach(([email, incoming]) => {
    const normalizedEmail = normalizeEmail(email);
    if (!db.users[normalizedEmail]) return;

    const existing = db.users[normalizedEmail];
    db.users[normalizedEmail] = ensureUserData({
      ...existing,
      ...publicUser(incoming),
      email: normalizedEmail,
      passwordHash: existing.passwordHash
    });
  });
  writeDb(db);

  res.json({ email: req.userEmail, users: publicUsers(db) });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`ClassSync running on http://${HOST}:${PORT}`);
});
