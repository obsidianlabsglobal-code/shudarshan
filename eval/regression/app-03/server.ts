import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Loose aliases: only express, jsonwebtoken and tsx are installed (no @types packages),
// and tsx runs TypeScript without type-checking.
type Req = any;
type Res = any;
type Next = (err?: unknown) => void;

type User = { id: string; name: string; email: string; passwordHash: string };
type Entry = {
  id: string;
  userId: string;
  date: string;
  title: string;
  body: string;
  mood: string;
  createdAt: string;
  updatedAt: string;
};
type DB = { users: User[]; entries: Entry[] };

const PORT = Number(process.env.PORT) || 3003;
// If JWT_SECRET is not set, a random secret is generated (tokens stop working after a restart).
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_FILE = path.join(__dirname, 'data.json');
const MOODS = ['great', 'good', 'okay', 'low', 'awful'];

// ---------- password hashing (scrypt, built into Node) ----------
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

// Used so unknown emails cost the same time as wrong passwords.
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));

// ---------- seed data ----------
const SEED_USERS = [
  { name: 'Alice', email: 'alice@example.com', password: 'Alice-Pass-2024!' },
  { name: 'Bob', email: 'bob@example.com', password: 'Bob-Pass-2024!' },
];

function buildSeed(): DB {
  const now = new Date().toISOString();
  const users: User[] = SEED_USERS.map((u) => ({
    id: crypto.randomUUID(),
    name: u.name,
    email: u.email,
    passwordHash: hashPassword(u.password),
  }));
  const [alice, bob] = users;
  const mk = (userId: string, date: string, title: string, body: string, mood: string): Entry => ({
    id: crypto.randomUUID(),
    userId,
    date,
    title,
    body,
    mood,
    createdAt: now,
    updatedAt: now,
  });
  const entries: Entry[] = [
    mk(alice.id, '2024-05-01', 'Morning run by the river', 'Got up early and ran 5km along the river path. Legs were heavy at first but I felt great by the end.', 'great'),
    mk(alice.id, '2024-05-02', 'Deadline stress', 'The project review got moved up to Friday. Spent the whole day triaging bugs and skipped lunch.', 'low'),
    mk(bob.id, '2024-05-01', 'Sourdough attempt #3', 'The loaf finally rose properly. Crust was crackly and the crumb was open. Sharing half with the neighbours.', 'good'),
    mk(bob.id, '2024-05-03', 'Rainy day reading', 'Stayed in and finished two chapters of my novel. Nothing special happened, but it was a calm, okay sort of day.', 'okay'),
  ];
  return { users, entries };
}

function save(data: DB): void {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function load(): DB {
  if (!fs.existsSync(DATA_FILE)) {
    const seeded = buildSeed();
    save(seeded);
    return seeded;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as DB;
}

if (process.argv.includes('--seed')) {
  save(buildSeed());
  console.log('Seeded ' + DATA_FILE + ' with users alice@example.com and bob@example.com');
  process.exit(0);
}

const db: DB = load();

// ---------- validation ----------
function isValidDate(s: unknown): boolean {
  if (typeof s !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parseEntry(input: any, requireAll: boolean): { error?: string; value?: any } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { error: 'JSON object body required' };
  }
  const value: any = {};
  if (input.title !== undefined || requireAll) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 120) {
      return { error: 'title must be a string of 1-120 characters' };
    }
    value.title = input.title.trim();
  }
  if (input.body !== undefined || requireAll) {
    if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 10000) {
      return { error: 'body must be a string of 1-10000 characters' };
    }
    value.body = input.body;
  }
  if (input.mood !== undefined || requireAll) {
    if (typeof input.mood !== 'string' || !MOODS.includes(input.mood)) {
      return { error: 'mood must be one of: ' + MOODS.join(', ') };
    }
    value.mood = input.mood;
  }
  if (input.date !== undefined) {
    if (!isValidDate(input.date)) return { error: 'date must be a valid YYYY-MM-DD date' };
    value.date = input.date;
  }
  if (!requireAll && Object.keys(value).length === 0) {
    return { error: 'provide at least one of: title, body, mood, date' };
  }
  return { value };
}

function publicEntry(e: Entry) {
  const { userId, ...rest } = e;
  return rest;
}

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// Very small in-memory limiter for login attempts: 10 per minute per IP.
const attempts = new Map<string, { count: number; reset: number }>();
function loginLimiter(req: Req, res: Res, next: Next) {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.reset <= now) attempts.delete(k);
  const key = req.ip || 'unknown';
  const rec = attempts.get(key) || { count: 0, reset: now + 60_000 };
  rec.count += 1;
  attempts.set(key, rec);
  if (rec.count > 10) return res.status(429).json({ error: 'Too many login attempts, try again later' });
  next();
}

app.post('/auth/login', loginLimiter, (req: Req, res: Res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

function requireAuth(req: Req, res: Res, next: Next) {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload: any = jwt.verify(match[1], JWT_SECRET, { algorithms: ['HS256'] });
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function findOwn(req: Req): Entry | undefined {
  return db.entries.find((e) => e.id === req.params.id && e.userId === req.userId);
}

// List the caller's entries (IDs included), newest date first.
// Optional ?q=term keeps only entries whose title or body contains the term (case-insensitive).
app.get('/entries', requireAuth, (req: Req, res: Res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const mine = db.entries
    .filter((e) => e.userId === req.userId)
    .filter((e) => !q || e.title.toLowerCase().includes(q) || e.body.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  res.json(mine.map(publicEntry));
});

app.get('/entries/:id', requireAuth, (req: Req, res: Res) => {
  const entry = findOwn(req);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  res.json(publicEntry(entry));
});

app.post('/entries', requireAuth, (req: Req, res: Res) => {
  const { error, value } = parseEntry(req.body, true);
  if (error) return res.status(400).json({ error });
  const now = new Date().toISOString();
  const entry: Entry = {
    id: crypto.randomUUID(),
    userId: req.userId,
    date: value.date ?? now.slice(0, 10),
    title: value.title,
    body: value.body,
    mood: value.mood,
    createdAt: now,
    updatedAt: now,
  };
  db.entries.push(entry);
  save(db);
  res.status(201).json(publicEntry(entry));
});

function update(requireAll: boolean) {
  return (req: Req, res: Res) => {
    const entry = findOwn(req);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    const { error, value } = parseEntry(req.body, requireAll);
    if (error) return res.status(400).json({ error });
    Object.assign(entry, value, { updatedAt: new Date().toISOString() });
    save(db);
    res.json(publicEntry(entry));
  };
}

// PUT replaces title, body and mood (date is kept unless supplied); PATCH updates any subset.
app.put('/entries/:id', requireAuth, update(true));
app.patch('/entries/:id', requireAuth, update(false));

app.delete('/entries/:id', requireAuth, (req: Req, res: Res) => {
  const entry = findOwn(req);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  db.entries.splice(db.entries.indexOf(entry), 1);
  save(db);
  res.status(204).end();
});

app.use((_req: Req, res: Res) => res.status(404).json({ error: 'Not found' }));

app.use((err: any, _req: Req, res: Res, _next: Next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('Journal API listening on http://localhost:' + PORT);
});
