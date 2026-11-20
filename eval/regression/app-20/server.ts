import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type User = { id: string; name: string; email: string; passwordHash: string };
type Card = {
  id: string;
  userId: string;
  term: string;
  translation: string;
  example: string;
  reviewScore: number;
};
type Db = { users: User[]; cards: Card[] };

const PORT = Number(process.env.PORT) || 3020;
const DATA_FILE = path.resolve(process.env.DATA_FILE || 'data.json');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// ---------- password hashing (scrypt, no extra dependencies) ----------
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

// ---------- seed data ----------
const SEED_USERS = [
  { name: 'Alice', email: 'alice@example.com', password: 'Alice!Fl4sh-Card9' },
  { name: 'Bob', email: 'bob@example.org', password: 'Bob!Fl4sh-Card7' },
];

function buildSeed(): Db {
  const users: User[] = SEED_USERS.map((u) => ({
    id: crypto.randomUUID(),
    name: u.name,
    email: u.email,
    passwordHash: hashPassword(u.password),
  }));
  const alice = users[0].id;
  const bob = users[1].id;
  const mk = (userId: string, term: string, translation: string, example: string, reviewScore: number): Card => ({
    id: crypto.randomUUID(),
    userId,
    term,
    translation,
    example,
    reviewScore,
  });
  const cards: Card[] = [
    mk(alice, 'biblioteca', 'library', 'Voy a la biblioteca para estudiar.', 3),
    mk(alice, 'madrugada', 'early morning', 'Me desperté de madrugada.', 1),
    mk(alice, 'aprovechar', 'to make the most of', 'Hay que aprovechar el buen tiempo.', 4),
    mk(bob, 'se débrouiller', 'to manage, to get by', 'Je me débrouille en français.', 2),
    mk(bob, 'la boulangerie', 'bakery', 'La boulangerie ouvre à sept heures.', 5),
    mk(bob, 'dépaysement', 'feeling of being in an unfamiliar place', 'Ce voyage offre un vrai dépaysement.', 0),
  ];
  return { users, cards };
}

// ---------- persistence ----------
function saveDb(data: Db): void {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
}

function loadDb(): Db {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Db;
  }
  const seeded = buildSeed();
  saveDb(seeded);
  return seeded;
}

// ---------- validation ----------
function validateCard(body: any, partial: boolean): { error?: string; value?: any } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const value: any = {};
  const rules = [
    ['term', 1, 200],
    ['translation', 1, 200],
    ['example', 0, 500],
  ] as const;
  for (const [key, min, max] of rules) {
    const v = body[key];
    if (v === undefined) {
      if (!partial && min > 0) return { error: `${key} is required` };
      continue;
    }
    if (typeof v !== 'string') return { error: `${key} must be a string` };
    const t = v.trim();
    if (t.length < min || t.length > max) return { error: `${key} must be ${min}-${max} characters` };
    value[key] = t;
  }
  if (body.reviewScore !== undefined) {
    const s = body.reviewScore;
    if (!Number.isInteger(s) || s < 0 || s > 5) return { error: 'reviewScore must be an integer from 0 to 5' };
    value.reviewScore = s;
  }
  if (!partial) {
    if (value.example === undefined) value.example = '';
    if (value.reviewScore === undefined) value.reviewScore = 0;
  } else if (Object.keys(value).length === 0) {
    return { error: 'Provide at least one of: term, translation, example, reviewScore' };
  }
  return { value };
}

function publicCard(c: Card) {
  return { id: c.id, term: c.term, translation: c.translation, example: c.example, reviewScore: c.reviewScore };
}

// ---------- login throttling (per IP, in memory) ----------
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; resetAt: number }>();

function isLimited(ip: string): boolean {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || now > entry.resetAt) {
    failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

// ---------- app ----------
let db: Db;
const app = express();
app.disable('x-powered-by');
app.use((_req: any, res: any, next: any) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '10kb' }));

function requireAuth(req: any, res: any, next: any) {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload: any = jwt.verify(header.slice(7), JWT_SECRET, { algorithms: ['HS256'] });
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.userId = user.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.post('/auth/login', (req: any, res: any) => {
  const ip = req.ip || 'unknown';
  if (isLimited(ip)) return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || password.length > 1024) {
    return res.status(400).json({ error: 'email and password are required strings' });
  }
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  const passwordOk = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !passwordOk) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

function findOwnCard(req: any): Card | undefined {
  return db.cards.find((c) => c.id === req.params.id && c.userId === req.userId);
}

app.get('/cards', requireAuth, (req: any, res: any) => {
  let cards = db.cards.filter((c) => c.userId === req.userId);
  // Optional case-insensitive substring search across the card's text fields.
  // Ignore non-string values (e.g. ?q=a&q=b) so they behave like an absent filter.
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  if (q) {
    cards = cards.filter((c) =>
      [c.term, c.translation, c.example].some((field) => field.toLowerCase().includes(q)),
    );
  }
  res.json(cards.map(publicCard));
});

app.get('/cards/:id', requireAuth, (req: any, res: any) => {
  const card = findOwnCard(req);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  res.json(publicCard(card));
});

app.post('/cards', requireAuth, (req: any, res: any) => {
  const { error, value } = validateCard(req.body, false);
  if (error) return res.status(400).json({ error });
  const card: Card = { id: crypto.randomUUID(), userId: req.userId, ...value };
  db.cards.push(card);
  saveDb(db);
  res.status(201).json(publicCard(card));
});

function updateCard(req: any, res: any) {
  const card = findOwnCard(req);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  const { error, value } = validateCard(req.body, true);
  if (error) return res.status(400).json({ error });
  Object.assign(card, value);
  saveDb(db);
  res.json(publicCard(card));
}
app.put('/cards/:id', requireAuth, updateCard);
app.patch('/cards/:id', requireAuth, updateCard);

app.delete('/cards/:id', requireAuth, (req: any, res: any) => {
  const card = findOwnCard(req);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  db.cards = db.cards.filter((c) => c.id !== card.id);
  saveDb(db);
  res.status(204).end();
});

app.use((_req: any, res: any) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.argv.includes('--seed')) {
  db = buildSeed();
  saveDb(db);
  console.log(`Seeded ${db.users.length} users and ${db.cards.length} cards into ${DATA_FILE}`);
} else {
  db = loadDb();
  if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET not set; using a random secret for this process (tokens are invalidated on restart).');
  }
  app.listen(PORT, () => {
    console.log(`Flashcard API listening on http://localhost:${PORT}`);
  });
}
