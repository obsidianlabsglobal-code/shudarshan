import express from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Only express, jsonwebtoken and tsx are installed (no @types packages), so handler types are loose.
type Req = any;
type Res = any;
type Next = (err?: unknown) => void;

const PORT = Number(process.env.PORT) || 3008;
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET not set: using a random secret, tokens will be invalid after a restart.');
}

const DB_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'db.json');

const STAGES = ['wishlist', 'applied', 'phone_screen', 'interview', 'offer', 'rejected', 'withdrawn'];

interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

interface Application {
  id: string;
  userId: string;
  company: string;
  role: string;
  stage: string;
  contactName: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface Db {
  users: User[];
  applications: Application[];
}

// ---------- password hashing (scrypt from node:crypto) ----------
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, keyHex] = stored.split(':');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword(randomBytes(8).toString('hex'));

// ---------- persistence ----------
function save(): void {
  const tmp = `${DB_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DB_FILE);
}

function buildSeed(): Db {
  const alice: User = {
    id: randomUUID(),
    name: 'Alice',
    email: 'alice@example.com',
    passwordHash: hashPassword('Alice-Tracker-4721'),
  };
  const bob: User = {
    id: randomUUID(),
    name: 'Bob',
    email: 'bob@example.org',
    passwordHash: hashPassword('Bob-Tracker-9356'),
  };
  const now = new Date().toISOString();
  const app = (userId: string, company: string, role: string, stage: string, contactName: string, notes: string): Application => ({
    id: randomUUID(),
    userId,
    company,
    role,
    stage,
    contactName,
    notes,
    createdAt: now,
    updatedAt: now,
  });
  return {
    users: [alice, bob],
    applications: [
      app(alice.id, 'Acme Robotics', 'Backend Engineer', 'interview', 'Priya Nair', 'Second-round system design scheduled for next Tuesday. Review message queues.'),
      app(alice.id, 'Northwind Health', 'Platform Engineer', 'applied', 'Tom Becker', 'Applied via referral. Follow up if no reply in two weeks.'),
      app(bob.id, 'Lumen Studios', 'Product Designer', 'phone_screen', 'Maria Alvarez', 'Portfolio walkthrough requested. Prepare the mobile onboarding case study.'),
      app(bob.id, 'Fjord Analytics', 'Data Analyst', 'offer', 'Henrik Olsen', 'Offer received, negotiating start date and remote days.'),
    ],
  };
}

function seed(): Db {
  const fresh = buildSeed();
  writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
  return fresh;
}

if (process.argv.includes('--seed')) {
  seed();
  console.log(`Seeded ${DB_FILE} with users Alice and Bob.`);
  process.exit(0);
}

let db: Db = existsSync(DB_FILE) ? JSON.parse(readFileSync(DB_FILE, 'utf8')) : seed();

// ---------- helpers ----------
const failures = new Map<string, { count: number; resetAt: number }>();

function isLimited(ip: string): boolean {
  const f = failures.get(ip);
  if (!f) return false;
  if (f.resetAt < Date.now()) {
    failures.delete(ip);
    return false;
  }
  return f.count >= 10;
}

function recordFailure(ip: string): void {
  const f = failures.get(ip);
  if (!f || f.resetAt < Date.now()) {
    failures.set(ip, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  } else {
    f.count++;
  }
}

function publicApp(a: Application) {
  const { userId, ...rest } = a;
  return rest;
}

function parseInput(body: unknown, partial: boolean): { value?: Record<string, string>; error?: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;
  const value: Record<string, string> = {};

  for (const key of ['company', 'role']) {
    const v = b[key];
    if (v === undefined) {
      if (!partial) return { error: `${key} is required` };
      continue;
    }
    if (typeof v !== 'string' || !v.trim() || v.length > 200) {
      return { error: `${key} must be a non-empty string up to 200 characters` };
    }
    value[key] = v.trim();
  }

  const stage = b.stage;
  if (stage === undefined) {
    if (!partial) return { error: 'stage is required' };
  } else if (typeof stage !== 'string' || !STAGES.includes(stage)) {
    return { error: `stage must be one of: ${STAGES.join(', ')}` };
  } else {
    value.stage = stage;
  }

  const optional: Array<[string, number]> = [['contactName', 200], ['notes', 5000]];
  for (const [key, max] of optional) {
    const v = b[key];
    if (v === undefined) {
      if (!partial) value[key] = '';
      continue;
    }
    if (typeof v !== 'string' || v.length > max) {
      return { error: `${key} must be a string up to ${max} characters` };
    }
    value[key] = v;
  }
  return { value };
}

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '100kb' }));

app.post('/auth/login', (req: Req, res: Res) => {
  const ip = String(req.ip);
  if (isLimited(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts, try again later' });
  }
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || password.length > 200) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  failures.delete(ip);
  const token = jwt.sign({}, JWT_SECRET, { subject: user.id, expiresIn: '1h', algorithm: 'HS256' });
  res.json({ token });
});

function requireAuth(req: Req, res: Res, next: Next) {
  const header: string = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = jwt.verify(match[1], JWT_SECRET, { algorithms: ['HS256'] }) as { sub?: string };
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const findOwned = (req: Req): Application | undefined =>
  db.applications.find((a) => a.id === req.params.id && a.userId === req.userId);

app.get('/applications', requireAuth, (req: Req, res: Res) => {
  let items = db.applications.filter((a) => a.userId === req.userId);
  // Optional case-insensitive substring search across the text fields. Only a single string value counts.
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  if (q) {
    items = items.filter((a) =>
      [a.company, a.role, a.contactName, a.notes].some((field) => field.toLowerCase().includes(q)),
    );
  }
  res.json(items.map(publicApp));
});

app.get('/applications/:id', requireAuth, (req: Req, res: Res) => {
  const found = findOwned(req);
  if (!found) return res.status(404).json({ error: 'Application not found' });
  res.json(publicApp(found));
});

app.post('/applications', requireAuth, (req: Req, res: Res) => {
  const parsed = parseInput(req.body, false);
  if (parsed.error || !parsed.value) return res.status(400).json({ error: parsed.error });
  const now = new Date().toISOString();
  const created: Application = {
    id: randomUUID(),
    userId: req.userId,
    company: parsed.value.company,
    role: parsed.value.role,
    stage: parsed.value.stage,
    contactName: parsed.value.contactName,
    notes: parsed.value.notes,
    createdAt: now,
    updatedAt: now,
  };
  db.applications.push(created);
  save();
  res.status(201).json(publicApp(created));
});

function updateHandler(partial: boolean) {
  return (req: Req, res: Res) => {
    const found = findOwned(req);
    if (!found) return res.status(404).json({ error: 'Application not found' });
    const parsed = parseInput(req.body, partial);
    if (parsed.error || !parsed.value) return res.status(400).json({ error: parsed.error });
    Object.assign(found, parsed.value, { updatedAt: new Date().toISOString() });
    save();
    res.json(publicApp(found));
  };
}

app.put('/applications/:id', requireAuth, updateHandler(false));
app.patch('/applications/:id', requireAuth, updateHandler(true));

app.delete('/applications/:id', requireAuth, (req: Req, res: Res) => {
  const found = findOwned(req);
  if (!found) return res.status(404).json({ error: 'Application not found' });
  db.applications = db.applications.filter((a) => a !== found);
  save();
  res.status(204).send();
});

app.use((_req: Req, res: Res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: Req, res: Res, _next: Next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Body too large' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Job application tracker listening on http://localhost:${PORT}`);
});
