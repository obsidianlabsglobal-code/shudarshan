import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type User = { id: number; name: string; email: string; passwordHash: string };
type Habit = {
  id: number;
  userId: number;
  name: string;
  description: string;
  targetPerWeek: number;
  checkIns: string[];
  createdAt: string;
};
type Db = { nextHabitId: number; users: User[]; habits: Habit[] };
type Fields = { name?: string; description?: string; targetPerWeek?: number; checkIns?: string[] };

const PORT = Number(process.env.PORT) || 3004;
// If JWT_SECRET is not set, a random secret is used (tokens become invalid on restart).
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
const DATA_FILE =
  process.env.DATA_FILE || join(dirname(fileURLToPath(import.meta.url)), 'data.json');

// ---------- password hashing ----------
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// ---------- seed data & persistence ----------
const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const today = (): string => daysAgo(0);

function buildSeed(): Db {
  const now = new Date().toISOString();
  return {
    nextHabitId: 5,
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com', passwordHash: hashPassword('alice-Pass#2024') },
      { id: 2, name: 'Bob', email: 'bob@example.com', passwordHash: hashPassword('bob-Pass#2024') },
    ],
    habits: [
      {
        id: 1,
        userId: 1,
        name: 'Morning run',
        description: 'Run 5km before breakfast',
        targetPerWeek: 4,
        checkIns: [daysAgo(5), daysAgo(3), daysAgo(1)],
        createdAt: now,
      },
      {
        id: 2,
        userId: 1,
        name: 'Read 20 pages',
        description: 'Read a chapter of a non-fiction book before bed',
        targetPerWeek: 7,
        checkIns: [daysAgo(4), daysAgo(3), daysAgo(2), daysAgo(1), daysAgo(0)],
        createdAt: now,
      },
      {
        id: 3,
        userId: 2,
        name: 'Drink 2L of water',
        description: 'Keep a bottle on the desk and refill it twice a day',
        targetPerWeek: 7,
        checkIns: [daysAgo(2), daysAgo(1)],
        createdAt: now,
      },
      {
        id: 4,
        userId: 2,
        name: 'Practice guitar',
        description: '30 minutes of scales and one new song',
        targetPerWeek: 3,
        checkIns: [daysAgo(6), daysAgo(2)],
        createdAt: now,
      },
    ],
  };
}

function save(data: Db): void {
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, DATA_FILE);
}

function load(): Db {
  if (existsSync(DATA_FILE)) {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Db;
  }
  const seeded = buildSeed();
  save(seeded);
  return seeded;
}

const seedMode = process.argv.includes('--seed');
const db: Db = seedMode ? buildSeed() : load();

if (seedMode) {
  save(db);
  console.log(`Seeded ${db.users.length} users and ${db.habits.length} habits into ${DATA_FILE}`);
  process.exit(0);
}

// ---------- validation helpers ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function normalizeDates(list: string[]): string[] {
  return [...new Set(list)].sort();
}

function parseFields(body: any, requireName: boolean): { error: string } | { value: Fields } {
  const v: Fields = {};
  if (body.name !== undefined || requireName) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) {
      return { error: 'name must be a non-empty string up to 100 characters' };
    }
    v.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 500) {
      return { error: 'description must be a string up to 500 characters' };
    }
    v.description = body.description;
  }
  if (body.targetPerWeek !== undefined) {
    const t = body.targetPerWeek;
    if (!Number.isInteger(t) || t < 1 || t > 7) {
      return { error: 'targetPerWeek must be an integer between 1 and 7' };
    }
    v.targetPerWeek = t;
  }
  if (body.checkIns !== undefined) {
    const c = body.checkIns;
    if (!Array.isArray(c) || c.length > 3660 || !c.every(isValidDate)) {
      return { error: 'checkIns must be an array of valid YYYY-MM-DD dates' };
    }
    v.checkIns = normalizeDates(c);
  }
  return { value: v };
}

const toPublic = (h: Habit) => ({
  id: h.id,
  name: h.name,
  description: h.description,
  targetPerWeek: h.targetPerWeek,
  checkIns: h.checkIns,
  createdAt: h.createdAt,
});

function findOwnedHabit(req: Request, res: Response): Habit | undefined {
  const raw = String(req.params.id);
  if (!/^\d+$/.test(raw)) {
    res.status(400).json({ error: 'Habit id must be a positive integer' });
    return undefined;
  }
  const id = Number(raw);
  const habit = db.habits.find((h) => h.id === id && h.userId === res.locals.userId);
  if (!habit) {
    res.status(404).json({ error: 'Habit not found' });
    return undefined;
  }
  return habit;
}

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '100kb' }));

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const id = Number(typeof payload === 'object' ? payload.sub : NaN);
    if (!db.users.some((u) => u.id === id)) throw new Error('unknown user');
    res.locals.userId = id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.post('/login', (req: Request, res: Response) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { email, password } = body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  // Always hash-compare to keep timing similar for unknown users.
  const stored = user ? user.passwordHash : hashPassword('dummy-password');
  const ok = verifyPassword(password, stored) && !!user;
  if (!user || !ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ email: user.email }, JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    expiresIn: '1h',
  });
  res.json({ token, expiresIn: 3600 });
});

// List own habits (ids included)
app.get('/habits', requireAuth, (_req: Request, res: Response) => {
  res.json(db.habits.filter((h) => h.userId === res.locals.userId).map(toPublic));
});

// Get one habit
app.get('/habits/:id', requireAuth, (req: Request, res: Response) => {
  const habit = findOwnedHabit(req, res);
  if (habit) res.json(toPublic(habit));
});

// Create a habit
app.post('/habits', requireAuth, (req: Request, res: Response) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const parsed = parseFields(body, true);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  const f = parsed.value;
  const habit: Habit = {
    id: db.nextHabitId++,
    userId: res.locals.userId,
    name: f.name as string,
    description: f.description ?? '',
    targetPerWeek: f.targetPerWeek ?? 7,
    checkIns: f.checkIns ?? [],
    createdAt: new Date().toISOString(),
  };
  db.habits.push(habit);
  save(db);
  res.status(201).json(toPublic(habit));
});

// Update a habit (name, description, targetPerWeek and/or replace checkIns)
const updateHandler = (req: Request, res: Response) => {
  const habit = findOwnedHabit(req, res);
  if (!habit) return;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const parsed = parseFields(body, false);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  Object.assign(habit, parsed.value);
  save(db);
  res.json(toPublic(habit));
};
app.put('/habits/:id', requireAuth, updateHandler);
app.patch('/habits/:id', requireAuth, updateHandler);

// Record a single check-in (defaults to today)
app.post('/habits/:id/check-ins', requireAuth, (req: Request, res: Response) => {
  const habit = findOwnedHabit(req, res);
  if (!habit) return;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const date = body.date === undefined ? today() : body.date;
  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD date' });
  }
  habit.checkIns = normalizeDates([...habit.checkIns, date]);
  save(db);
  res.json(toPublic(habit));
});

// Delete a habit
app.delete('/habits/:id', requireAuth, (req: Request, res: Response) => {
  const habit = findOwnedHabit(req, res);
  if (!habit) return;
  db.habits.splice(db.habits.indexOf(habit), 1);
  save(db);
  res.status(204).end();
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Habit tracker listening on http://localhost:${PORT}`);
});
