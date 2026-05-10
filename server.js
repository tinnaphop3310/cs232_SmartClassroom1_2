const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-deploying';
const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || '';
const S3_BUCKET = process.env.S3_BUCKET || '';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const useDynamoDb = Boolean(DYNAMODB_TABLE);
const useS3 = Boolean(S3_BUCKET);
const dynamo = useDynamoDb
  ? DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }))
  : null;
const s3 = useS3 ? new S3Client({ region: AWS_REGION }) : null;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
  }
}

function readJsonDb() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeJsonDb(db) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

async function readDb() {
  if (!useDynamoDb) return readJsonDb();

  const result = await dynamo.send(new ScanCommand({ TableName: DYNAMODB_TABLE }));
  const users = {};
  (result.Items || []).forEach(user => {
    users[user.email] = ensureUserData(user);
  });
  return { users };
}

async function writeUser(user) {
  if (!useDynamoDb) {
    const db = readJsonDb();
    db.users[user.email] = ensureUserData(user);
    writeJsonDb(db);
    return;
  }

  await dynamo.send(new PutCommand({
    TableName: DYNAMODB_TABLE,
    Item: ensureUserData(user)
  }));
}

async function getStoredUser(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!useDynamoDb) {
    return readJsonDb().users[normalizedEmail] || null;
  }

  const result = await dynamo.send(new GetCommand({
    TableName: DYNAMODB_TABLE,
    Key: { email: normalizedEmail }
  }));
  return result.Item ? ensureUserData(result.Item) : null;
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function uploadProofImage(email, task) {
  if (!useS3 || !task?.proofImg?.startsWith?.('data:')) return task;

  const parsed = parseDataUrl(task.proofImg);
  if (!parsed) return task;

  const extension = parsed.contentType.split('/')[1] || 'jpg';
  const safeEmail = normalizeEmail(email).replace(/[^a-z0-9._-]/g, '_');
  const key = `proofs/${safeEmail}/${task.id || Date.now()}.${extension}`;

  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: parsed.buffer,
    ContentType: parsed.contentType
  }));

  return {
    ...task,
    proofImg: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`,
    proofS3Key: key
  };
}

async function prepareUserForStorage(user) {
  const storedUser = ensureUserData({ ...user });
  storedUser.tasks = await Promise.all(
    storedUser.tasks.map(task => uploadProofImage(storedUser.email, task))
  );
  storedUser.groupInvites = await Promise.all(
    storedUser.groupInvites.map(async invite => ({
      ...invite,
      task: await uploadProofImage(storedUser.email, invite.task)
    }))
  );
  return storedUser;
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

  const existingUser = await getStoredUser(email);
  if (existingUser) return res.status(409).json({ error: 'This email already has an account. Please login instead.' });

  await writeUser(ensureUserData({
    email,
    name: name || email.split('@')[0],
    passwordHash: await bcrypt.hash(password, 10),
    tasks: [],
    tagColors: {},
    friends: [],
    friendRequests: [],
    sentFriendRequests: [],
    groupInvites: []
  }));
  const db = await readDb();

  res.status(201).json({
    token: signToken(email),
    email,
    users: publicUsers(db)
  });
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const user = await getStoredUser(email);

  if (!user || !(await bcrypt.compare(password, user.passwordHash || ''))) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  const db = await readDb();
  res.json({
    token: signToken(email),
    email,
    users: publicUsers(db)
  });
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const db = await readDb();
  if (!db.users[req.userEmail]) return res.status(404).json({ error: 'Account not found.' });
  res.json({ email: req.userEmail, users: publicUsers(db) });
});

app.put('/api/users/state', authRequired, async (req, res) => {
  const incomingUsers = req.body.users;
  if (!incomingUsers || typeof incomingUsers !== 'object') {
    return res.status(400).json({ error: 'Invalid user state.' });
  }

  const db = await readDb();
  for (const [email, incoming] of Object.entries(incomingUsers)) {
    const normalizedEmail = normalizeEmail(email);
    if (!db.users[normalizedEmail]) continue;

    const existing = db.users[normalizedEmail];
    db.users[normalizedEmail] = await prepareUserForStorage({
      ...existing,
      ...publicUser(incoming),
      email: normalizedEmail,
      passwordHash: existing.passwordHash
    });
    await writeUser(db.users[normalizedEmail]);
  }

  res.json({ email: req.userEmail, users: publicUsers(db) });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`ClassSync running on http://${HOST}:${PORT}`);
  console.log(useDynamoDb ? `Using DynamoDB table: ${DYNAMODB_TABLE}` : `Using local JSON database: ${DATA_FILE}`);
  console.log(useS3 ? `Using S3 bucket for proof images: ${S3_BUCKET}` : 'S3 proof uploads disabled.');
});
