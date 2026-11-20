import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// NOTE: only express, jsonwebtoken and tsx are installed, so request/response
// objects are loosely typed. tsx runs TypeScript without type-checking.

type User = { id: number; name: string; email: string; passwordHash: string };
type Appointment = {
  id: number;
  userId: number;
  date: string;
  personMet: string;
  location: string;
  agenda: string;
  followUpNotes: string;
  createdAt: string;
  updatedAt: string;
};
type Db = { users: User[]; appointments: Appointment[]; nextAppointmentId: number };

const PORT = Number(process.env.PORT) || 3024;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const MAX_LEN = 2000;

// ---------- password hashing (scrypt, built into Node) ----------

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

// ---------- storage (JSON file) ----------

function buildSeed(): Db {
  const now = new Date().toISOString();
  const base = { createdAt: now, updatedAt: now };
  return {
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com', passwordHash: hashPassword('alice-Pass#2024') },
      { id: 2, name: 'Bob', email: 'bob@example.net', passwordHash: hashPassword('bob-Secret#2024') },
    ],
    appointments: [
      {
        id: 1,
        userId: 1,
        date: '2025-03-04T10:00:00Z',
        personMet: 'Priya Nair',
        location: 'Cafe Lumen, 14 Harbor St',
        agenda: 'Review the Q2 product roadmap and open hiring needs',
        followUpNotes: 'Send roadmap draft by Friday; Priya to share two candidate profiles.',
        ...base,
      },
      {
        id: 2,
        userId: 1,
        date: '2025-03-11T15:30:00Z',
        personMet: 'Dr. Martin Oyelaran',
        location: 'Riverside Clinic, Room 3',
        agenda: 'Annual check-up and discussion of sleep issues',
        followUpNotes: 'Schedule blood work; keep a sleep journal for two weeks.',
        ...base,
      },
      {
        id: 3,
        userId: 2,
        date: '2025-03-06T09:00:00Z',
        personMet: 'Hannah Schmidt',
        location: 'Office 2B, Westgate Tower',
        agenda: 'Contract renewal terms for the warehouse lease',
        followUpNotes: 'Request revised maintenance-cost clause; Hannah will reply Tuesday.',
        ...base,
      },
      {
        id: 4,
        userId: 2,
        date: '2025-03-13T18:45:00Z',
        personMet: 'Luis Ortega',
        location: 'Community Climbing Gym lobby',
        agenda: 'Plan the weekend trip to the Pine Ridge trails',
        followUpNotes: 'Book campsite for 3 people; Luis brings the tent.',
        ...base,
      },
    ],
    nextAppointmentId: 5,
  };
}

function saveDb(data: Db): void {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
}

function loadDb(): Db {
  if (!fs.existsSync(DATA_FILE)) {
    const seeded = buildSeed();
    saveDb(seeded);
    return seeded;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Db;
}

// ---------- seed command ----------

if (process.argv.includes('--seed')) {
  saveDb(buildSeed());
  console.log(`Seeded users (Alice, Bob) and 4 appointments into ${DATA_FILE}`);
  process.exit(0);
}

const db: Db = loadDb();

// ---------- helpers ----------

const FIELDS = ['date', 'personMet', 'location', 'agenda', 'followUpNotes'];
const REQUIRED = ['date', 'personMet', 'location', 'agenda'];

function parseFields(body: any, requireAll: boolean): { error: string } | { value: Record<string, string> } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const value: Record<string, string> = {};
  for (const field of FIELDS) {
    const raw = body[field];
    if (raw === undefined) {
      if (requireAll && REQUIRED.includes(field)) return { error: `${field} is required` };
      continue;
    }
    if (typeof raw !== 'string') return { error: `${field} must be a string` };
    const v = raw.trim();
    if (REQUIRED.includes(field) && v === '') return { error: `${field} must not be empty` };
    if (v.length > MAX_LEN) return { error: `${field} must be at most ${MAX_LEN} characters` };
    if (field === 'date' && Number.isNaN(Date.parse(v))) {
      return { error: 'date must be a valid ISO 8601 date or datetime' };
    }
    value[field] = v;
  }
  return { value };
}

function toPublic(a: Appointment) {
  return {
    id: a.id,
    date: a.date,
    personMet: a.personMet,
    location: a.location,
    agenda: a.agenda,
    followUpNotes: a.followUpNotes,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function parseId(req: any): number | null {
  const id = Number(req.params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function findOwned(req: any, id: number): Appointment | undefined {
  // Only the owner can see a record; others get the same 404 as a missing ID.
  return db.appointments.find((a) => a.id === id && a.userId === req.userId);
}

function requireAuth(req: any, res: any, next: any) {
  const header = String(req.headers.authorization || '');
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
    const user = db.users.find((u) => u.id === Number(payload.sub));
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.userId = user.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------- app ----------

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.post('/auth/login', (req: any, res: any) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required strings' });
  }
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ email: user.email }, JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    expiresIn: '1h',
  });
  res.json({ token });
});

app.use('/appointments', requireAuth);

app.get('/appointments', (req: any, res: any) => {
  const list = db.appointments.filter((a) => a.userId === req.userId).map(toPublic);
  res.json(list);
});

app.get('/appointments/:id', (req: any, res: any) => {
  const id = parseId(req);
  const appt = id === null ? undefined : findOwned(req, id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  res.json(toPublic(appt));
});

app.post('/appointments', (req: any, res: any) => {
  const parsed = parseFields(req.body, true);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  const v = parsed.value;
  const now = new Date().toISOString();
  const appt: Appointment = {
    id: db.nextAppointmentId++,
    userId: req.userId,
    date: v.date,
    personMet: v.personMet,
    location: v.location,
    agenda: v.agenda,
    followUpNotes: v.followUpNotes ?? '',
    createdAt: now,
    updatedAt: now,
  };
  db.appointments.push(appt);
  saveDb(db);
  res.status(201).json(toPublic(appt));
});

function updateHandler(replace: boolean) {
  return (req: any, res: any) => {
    const id = parseId(req);
    const appt = id === null ? undefined : findOwned(req, id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    const parsed = parseFields(req.body, replace);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const v = parsed.value;
    if (!replace && Object.keys(v).length === 0) {
      return res.status(400).json({ error: 'Provide at least one field to update' });
    }
    if (replace) {
      appt.date = v.date;
      appt.personMet = v.personMet;
      appt.location = v.location;
      appt.agenda = v.agenda;
      appt.followUpNotes = v.followUpNotes ?? '';
    } else {
      if (v.date !== undefined) appt.date = v.date;
      if (v.personMet !== undefined) appt.personMet = v.personMet;
      if (v.location !== undefined) appt.location = v.location;
      if (v.agenda !== undefined) appt.agenda = v.agenda;
      if (v.followUpNotes !== undefined) appt.followUpNotes = v.followUpNotes;
    }
    appt.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json(toPublic(appt));
  };
}

app.put('/appointments/:id', updateHandler(true));
app.patch('/appointments/:id', updateHandler(false));

app.delete('/appointments/:id', (req: any, res: any) => {
  const id = parseId(req);
  const appt = id === null ? undefined : findOwned(req, id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  db.appointments = db.appointments.filter((a) => a.id !== appt.id);
  saveDb(db);
  res.status(204).end();
});

app.use((_req: any, res: any) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: any, res: any, _next: any) => {
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
  console.log(`Appointment notes API listening on http://localhost:${PORT}`);
});
