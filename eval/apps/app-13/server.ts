import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3013;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
// If JWT_SECRET is not set, a random secret is generated (tokens stop working after a restart).
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

interface PlannerEvent {
  id: string;
  userId: string;
  title: string;
  date: string;
  location: string;
  guests: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface Db {
  users: User[];
  events: PlannerEvent[];
}

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

const DUMMY_HASH = hashPassword('not-a-real-password');

// ---------- seed data ----------
const SEED = [
  {
    name: 'Alice',
    email: 'alice@example.com',
    password: 'alice-Pass-4821!',
    events: [
      {
        title: 'Garden Brunch',
        date: '2025-06-14T11:00:00Z',
        location: '42 Maple Street, Portland',
        guests: ['Dana Whitfield', 'Marcus Lee', 'Ines Duarte'],
        notes: 'Vegetarian menu. Borrow extra chairs from the neighbours. Lemonade and fruit platter.'
      },
      {
        title: 'Book Launch Dinner for Priya',
        date: '2025-09-05T19:30:00Z',
        location: 'Harbor House Restaurant, private room',
        guests: ['Priya Nair', 'Tom Becker', 'Yuki Tanaka', 'Omar Haddad'],
        notes: 'Reserve table for 12. Order 10 signed copies from the bookstore. Toast at 8pm.'
      }
    ]
  },
  {
    name: 'Bob',
    email: 'bob@example.com',
    password: 'bob-Pass-7392!',
    events: [
      {
        title: 'Lakeside Camping Weekend',
        date: '2025-07-19T09:00:00Z',
        location: 'Clearwater Lake Campground, Site 17',
        guests: ['Carlos Mena', 'Hannah Frost'],
        notes: 'Bring two tents, firewood and the cooler. Check fire restrictions before leaving.'
      },
      {
        title: 'Office Trivia Night',
        date: '2025-10-23T18:00:00Z',
        location: 'The Rusty Anchor Pub',
        guests: ['Greta Olsen', 'Samir Patel', 'Lena Fischer', 'Victor Cho', 'Nadia Kowalski'],
        notes: 'Teams of five. Prepare 40 questions across 4 rounds. Winning team gets gift cards.'
      }
    ]
  }
];

function buildSeedDb(): Db {
  const db: Db = { users: [], events: [] };
  const now = new Date().toISOString();
  for (const s of SEED) {
    const userId = crypto.randomUUID();
    db.users.push({ id: userId, name: s.name, email: s.email, passwordHash: hashPassword(s.password) });
    for (const e of s.events) {
      db.events.push({ id: crypto.randomUUID(), userId, ...e, createdAt: now, updatedAt: now });
    }
  }
  return db;
}

// ---------- persistence (JSON file) ----------
function saveDb(data: Db): void {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
}

function loadDb(): Db {
  if (!fs.existsSync(DATA_FILE)) {
    const fresh = buildSeedDb();
    saveDb(fresh);
    return fresh;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Db;
}

if (process.argv.includes('--seed')) {
  saveDb(buildSeedDb());
  console.log('Seeded ' + SEED.length + ' users into ' + DATA_FILE);
  process.exit(0);
}

const db = loadDb();

// ---------- helpers ----------
function publicEvent(e: PlannerEvent) {
  const { userId, ...rest } = e;
  return rest;
}

function validateEvent(body: unknown, partial: boolean): { error: string } | { value: Record<string, unknown> } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const text = (key: string, max: number, required: boolean): string | null => {
    const v = b[key];
    if (v === undefined) {
      if (!partial) {
        if (required) return key + ' is required';
        out[key] = '';
      }
      return null;
    }
    if (typeof v !== 'string') return key + ' must be a string';
    const t = v.trim();
    if (required && !t) return key + ' must not be empty';
    if (t.length > max) return key + ' must be at most ' + max + ' characters';
    out[key] = t;
    return null;
  };

  const problem =
    text('title', 200, true) ||
    text('date', 64, true) ||
    text('location', 300, false) ||
    text('notes', 5000, false);
  if (problem) return { error: problem };

  if (typeof out.date === 'string' && Number.isNaN(Date.parse(out.date))) {
    return { error: 'date must be a valid date string (ISO 8601 recommended)' };
  }

  const g = b.guests;
  if (g === undefined) {
    if (!partial) out.guests = [];
  } else if (
    !Array.isArray(g) ||
    g.length > 500 ||
    g.some((x) => typeof x !== 'string' || !x.trim() || x.length > 200)
  ) {
    return { error: 'guests must be an array of up to 500 non-empty strings (max 200 characters each)' };
  } else {
    out.guests = g.map((x: string) => x.trim());
  }

  return { value: out };
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    res.locals.userId = user.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function findOwnEvent(req: Request, res: Response): PlannerEvent | undefined {
  return db.events.find((e) => e.id === req.params.id && e.userId === res.locals.userId);
}

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/auth/login', (req, res) => {
  const { email, password } = (req.body || {}) as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required strings' });
  }
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ email: user.email }, JWT_SECRET, {
    subject: user.id,
    expiresIn: '1h',
    algorithm: 'HS256'
  });
  res.json({ token, expiresIn: '1h', user: { id: user.id, name: user.name, email: user.email } });
});

app.get('/events', requireAuth, (_req, res) => {
  const mine = db.events
    .filter((e) => e.userId === res.locals.userId)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .map(publicEvent);
  res.json(mine);
});

app.get('/events/:id', requireAuth, (req, res) => {
  const ev = findOwnEvent(req, res);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json(publicEvent(ev));
});

app.post('/events', requireAuth, (req, res) => {
  const result = validateEvent(req.body, false);
  if ('error' in result) return res.status(400).json({ error: result.error });
  const now = new Date().toISOString();
  const v = result.value as Pick<PlannerEvent, 'title' | 'date' | 'location' | 'guests' | 'notes'>;
  const ev: PlannerEvent = {
    id: crypto.randomUUID(),
    userId: res.locals.userId,
    title: v.title,
    date: v.date,
    location: v.location,
    guests: v.guests,
    notes: v.notes,
    createdAt: now,
    updatedAt: now
  };
  db.events.push(ev);
  saveDb(db);
  res.status(201).location('/events/' + ev.id).json(publicEvent(ev));
});

function updateHandler(partial: boolean) {
  return (req: Request, res: Response) => {
    const ev = findOwnEvent(req, res);
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    const result = validateEvent(req.body, partial);
    if ('error' in result) return res.status(400).json({ error: result.error });
    Object.assign(ev, result.value, { updatedAt: new Date().toISOString() });
    saveDb(db);
    res.json(publicEvent(ev));
  };
}

app.put('/events/:id', requireAuth, updateHandler(false));
app.patch('/events/:id', requireAuth, updateHandler(true));

app.delete('/events/:id', requireAuth, (req, res) => {
  const ev = findOwnEvent(req, res);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  db.events.splice(db.events.indexOf(ev), 1);
  saveDb(db);
  res.status(204).end();
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('Event planner listening on port ' + PORT);
});
