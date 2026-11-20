import express from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- Config ----------
const PORT = Number(process.env.PORT) || 3018;
// Set JWT_SECRET in real deployments. If unset, a random secret is generated per run
// (tokens then become invalid after a restart).
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
const DIR = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(DIR, 'data.json');
const CREDS_FILE = join(DIR, 'sudarshan.json');

// ---------- Types ----------
interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
}

interface Subscription {
  id: number;
  userId: number;
  provider: string;
  monthlyCost: number;
  renewalDate: string; // YYYY-MM-DD
  accountNote: string;
}

interface Db {
  users: User[];
  subscriptions: Subscription[];
  nextId: number;
}

// ---------- Seed data ----------
const SEED_USERS = [
  { name: 'Alice', email: 'alice@example.com', password: 'Alice-Tracker-91!' },
  { name: 'Bob', email: 'bob@example.com', password: 'Bob-Tracker-47!' },
];

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

function buildSeed(): Db {
  const users: User[] = SEED_USERS.map((u, i) => ({
    id: i + 1,
    name: u.name,
    email: u.email,
    passwordHash: hashPassword(u.password),
  }));
  const subscriptions: Subscription[] = [
    { id: 1, userId: 1, provider: 'Netflix', monthlyCost: 15.49, renewalDate: '2025-07-03', accountNote: 'Standard plan, shared with my sister' },
    { id: 2, userId: 1, provider: 'Spotify Premium', monthlyCost: 11.99, renewalDate: '2025-07-18', accountNote: 'Duo plan, login via Google account' },
    { id: 3, userId: 2, provider: 'Adobe Creative Cloud', monthlyCost: 59.99, renewalDate: '2025-08-01', accountNote: 'Annual plan billed monthly, cancel before August' },
    { id: 4, userId: 2, provider: 'GitHub Copilot', monthlyCost: 10, renewalDate: '2025-07-25', accountNote: 'Personal account, billed to the travel card' },
  ];
  return { users, subscriptions, nextId: 5 };
}

function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, file);
}

function seedFiles(): Db {
  const seeded = buildSeed();
  writeJsonAtomic(DATA_FILE, seeded);
  writeJsonAtomic(CREDS_FILE, {
    users: SEED_USERS.map(({ name, email, password }) => ({ name, email, password })),
  });
  return seeded;
}

// ---------- Load / seed ----------
const wantsSeed = process.argv.includes('--seed');
const db: Db = wantsSeed || !existsSync(DATA_FILE)
  ? seedFiles()
  : (JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Db);

if (wantsSeed) {
  console.log('Seeded data.json and sudarshan.json (users: ' + SEED_USERS.map((u) => u.email).join(', ') + ')');
  process.exit(0);
}

function save(): void {
  writeJsonAtomic(DATA_FILE, db);
}

// ---------- Helpers ----------
function toPublic(s: Subscription) {
  return {
    id: s.id,
    provider: s.provider,
    monthlyCost: s.monthlyCost,
    renewalDate: s.renewalDate,
    accountNote: s.accountNote,
  };
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parseInput(body: any, partial: boolean): { data?: any; error?: string } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const out: any = {};

  if (body.provider !== undefined || !partial) {
    if (typeof body.provider !== 'string' || !body.provider.trim() || body.provider.trim().length > 100) {
      return { error: 'provider must be a non-empty string of at most 100 characters' };
    }
    out.provider = body.provider.trim();
  }

  if (body.monthlyCost !== undefined || !partial) {
    if (typeof body.monthlyCost !== 'number' || !Number.isFinite(body.monthlyCost) || body.monthlyCost < 0 || body.monthlyCost > 1000000) {
      return { error: 'monthlyCost must be a number between 0 and 1000000' };
    }
    out.monthlyCost = Math.round(body.monthlyCost * 100) / 100;
  }

  if (body.renewalDate !== undefined || !partial) {
    if (typeof body.renewalDate !== 'string' || !isValidDate(body.renewalDate)) {
      return { error: 'renewalDate must be a valid date in YYYY-MM-DD format' };
    }
    out.renewalDate = body.renewalDate;
  }

  if (body.accountNote !== undefined) {
    if (typeof body.accountNote !== 'string' || body.accountNote.length > 500) {
      return { error: 'accountNote must be a string of at most 500 characters' };
    }
    out.accountNote = body.accountNote;
  } else if (!partial) {
    out.accountNote = '';
  }

  if (Object.keys(out).length === 0) {
    return { error: 'No updatable fields provided' };
  }
  return { data: out };
}

// Returns the subscription only if it exists AND belongs to the current user.
function findOwned(req: any): Subscription | undefined {
  const raw = String(req.params.id);
  if (!/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  return db.subscriptions.find((s) => s.id === id && s.userId === req.userId);
}

// ---------- Auth ----------
function requireAuth(req: any, res: any, next: any): void {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const userId = Number(payload.sub);
    if (!db.users.some((u) => u.id === userId)) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    req.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

app.post('/auth/login', (req: any, res: any) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  const token = jwt.sign({ email: user.email }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
    subject: String(user.id),
  });
  res.json({ token });
});

app.get('/subscriptions', requireAuth, (req: any, res: any) => {
  res.json(db.subscriptions.filter((s) => s.userId === req.userId).map(toPublic));
});

app.get('/subscriptions/:id', requireAuth, (req: any, res: any) => {
  const sub = findOwned(req);
  if (!sub) {
    res.status(404).json({ error: 'Subscription not found' });
    return;
  }
  res.json(toPublic(sub));
});

app.post('/subscriptions', requireAuth, (req: any, res: any) => {
  const { data, error } = parseInput(req.body, false);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const sub: Subscription = { id: db.nextId++, userId: req.userId, ...data };
  db.subscriptions.push(sub);
  save();
  res.status(201).json(toPublic(sub));
});

function update(partial: boolean) {
  return (req: any, res: any) => {
    const sub = findOwned(req);
    if (!sub) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }
    const { data, error } = parseInput(req.body, partial);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    Object.assign(sub, data);
    save();
    res.json(toPublic(sub));
  };
}

app.put('/subscriptions/:id', requireAuth, update(false));
app.patch('/subscriptions/:id', requireAuth, update(true));

app.delete('/subscriptions/:id', requireAuth, (req: any, res: any) => {
  const sub = findOwned(req);
  if (!sub) {
    res.status(404).json({ error: 'Subscription not found' });
    return;
  }
  db.subscriptions = db.subscriptions.filter((s) => s.id !== sub.id);
  save();
  res.status(204).end();
});

app.use((_req: any, res: any) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  if (err && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' });
  } else if (err && err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large' });
  } else {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log('Subscription tracker listening on port ' + PORT);
  if (!process.env.JWT_SECRET) {
    console.log('JWT_SECRET not set: using a random secret for this run.');
  }
});
