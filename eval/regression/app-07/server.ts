import express from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type User = { id: string; name: string; email: string; passwordHash: string };
type Note = {
  id: string;
  ownerId: string;
  course: string;
  topic: string;
  body: string;
  lastEdited: string;
};
type Db = { users: User[]; notes: Note[] };

const PORT = Number(process.env.PORT) || 3007;
// Set JWT_SECRET to keep tokens valid across restarts; otherwise a random one is generated per process.
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
const DATA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.json');

// ---------- password hashing (scrypt, built into Node) ----------
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword(randomBytes(8).toString('hex'));

// ---------- seed data ----------
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function buildSeed(): Db {
  const alice: User = {
    id: randomUUID(),
    name: 'Alice',
    email: 'alice@example.com',
    passwordHash: hashPassword('alice-Study#2024'),
  };
  const bob: User = {
    id: randomUUID(),
    name: 'Bob',
    email: 'bob@example.com',
    passwordHash: hashPassword('bob-Notes#2024'),
  };
  const notes: Note[] = [
    {
      id: randomUUID(),
      ownerId: alice.id,
      course: 'Biology 101',
      topic: 'Cell respiration',
      body: 'Glycolysis happens in the cytoplasm and yields 2 ATP. The Krebs cycle and the electron transport chain occur in the mitochondria; the ETC produces most of the ATP.',
      lastEdited: daysAgo(6),
    },
    {
      id: randomUUID(),
      ownerId: alice.id,
      course: 'World History',
      topic: 'Causes of the French Revolution',
      body: 'Financial crisis, unequal taxation across the three estates, Enlightenment ideas, and poor harvests in 1788 raised tensions that led to the storming of the Bastille.',
      lastEdited: daysAgo(2),
    },
    {
      id: randomUUID(),
      ownerId: bob.id,
      course: 'Algorithms',
      topic: 'Dijkstra shortest path',
      body: 'Greedy algorithm using a priority queue. Works only with non-negative edge weights. Runs in O((V + E) log V) with a binary heap.',
      lastEdited: daysAgo(4),
    },
    {
      id: randomUUID(),
      ownerId: bob.id,
      course: 'Microeconomics',
      topic: 'Price elasticity of demand',
      body: 'Elasticity = %change in quantity demanded / %change in price. Values above 1 are elastic; below 1 are inelastic. Necessities tend to be inelastic.',
      lastEdited: daysAgo(1),
    },
  ];
  return { users: [alice, bob], notes };
}

// ---------- persistence ----------
function save(db: Db): void {
  const tmp = DATA_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DATA_FILE);
}

function load(): Db {
  if (!existsSync(DATA_FILE)) {
    const seeded = buildSeed();
    save(seeded);
    return seeded;
  }
  return JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Db;
}

// ---------- seed command ----------
if (process.argv.includes('--seed')) {
  save(buildSeed());
  console.log('Seeded ' + DATA_FILE + ' with users alice@example.com and bob@example.com');
  process.exit(0);
}

const db = load();

// ---------- validation ----------
const LIMITS: Record<string, number> = { course: 100, topic: 200, body: 20000 };

function readFields(
  input: any,
  partial: boolean
): { error?: string; value?: Record<string, string> } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Request body must be a JSON object' };
  }
  const value: Record<string, string> = {};
  for (const key of Object.keys(LIMITS)) {
    const v = input[key];
    if (v === undefined) {
      if (partial) continue;
      return { error: key + ' is required' };
    }
    if (typeof v !== 'string' || v.trim() === '') {
      return { error: key + ' must be a non-empty string' };
    }
    if (v.length > LIMITS[key]) {
      return { error: key + ' must be at most ' + LIMITS[key] + ' characters' };
    }
    value[key] = v.trim();
  }
  if (partial && Object.keys(value).length === 0) {
    return { error: 'Provide at least one of: course, topic, body' };
  }
  return { value };
}

function publicNote(n: Note) {
  return { id: n.id, course: n.course, topic: n.topic, body: n.body, lastEdited: n.lastEdited };
}

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

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
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  res.json({ token });
});

app.get('/notes', requireAuth, (req: any, res: any) => {
  let mine = db.notes.filter((n) => n.ownerId === req.userId);
  // Optional case-insensitive substring search across the text fields.
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  if (q) {
    mine = mine.filter((n) =>
      [n.course, n.topic, n.body].some((field) => field.toLowerCase().includes(q))
    );
  }
  res.json(mine.map(publicNote));
});

app.get('/notes/:id', requireAuth, (req: any, res: any) => {
  const note = db.notes.find((n) => n.id === req.params.id && n.ownerId === req.userId);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(publicNote(note));
});

app.post('/notes', requireAuth, (req: any, res: any) => {
  const { error, value } = readFields(req.body, false);
  if (error || !value) return res.status(400).json({ error });
  const note: Note = {
    id: randomUUID(),
    ownerId: req.userId,
    course: value.course,
    topic: value.topic,
    body: value.body,
    lastEdited: new Date().toISOString(),
  };
  db.notes.push(note);
  save(db);
  res.status(201).json(publicNote(note));
});

function updateHandler(partial: boolean) {
  return (req: any, res: any) => {
    const note = db.notes.find((n) => n.id === req.params.id && n.ownerId === req.userId);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    const { error, value } = readFields(req.body, partial);
    if (error || !value) return res.status(400).json({ error });
    Object.assign(note, value);
    note.lastEdited = new Date().toISOString();
    save(db);
    res.json(publicNote(note));
  };
}

app.put('/notes/:id', requireAuth, updateHandler(false));
app.patch('/notes/:id', requireAuth, updateHandler(true));

app.delete('/notes/:id', requireAuth, (req: any, res: any) => {
  const idx = db.notes.findIndex((n) => n.id === req.params.id && n.ownerId === req.userId);
  if (idx === -1) return res.status(404).json({ error: 'Note not found' });
  db.notes.splice(idx, 1);
  save(db);
  res.status(204).end();
});

app.use((_req: any, res: any) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('Study notes API listening on http://localhost:' + PORT);
});
