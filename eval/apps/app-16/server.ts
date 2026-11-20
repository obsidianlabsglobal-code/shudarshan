import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data.json');
const CREDS_FILE = path.join(__dirname, 'sudarshan.json');
const PORT = Number(process.env.PORT) || 3016;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const TOKEN_TTL = '1h';

interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

interface Contact {
  id: number;
  userId: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface Db {
  users: User[];
  contacts: Contact[];
  nextContactId: number;
}

// ---------- password hashing (scrypt, built into Node) ----------

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

// ---------- seed data ----------

const SEED_USERS = [
  { id: 'u1', name: 'Alice', email: 'alice@example.com', password: 'AlicePass#2024' },
  { id: 'u2', name: 'Bob', email: 'bob@example.com', password: 'BobPass#2024' },
];

const SEED_CONTACTS: Record<string, Array<{ name: string; phone: string; email: string; notes: string }>> = {
  u1: [
    {
      name: 'Dr. Maria Lopez',
      phone: '+1-555-0101',
      email: 'maria.lopez@smileclinic.example',
      notes: 'Dentist. Prefers morning appointments. Next cleaning in March.',
    },
    {
      name: 'Chen Wei',
      phone: '+1-555-0102',
      email: 'chen.wei@fixitplumbing.example',
      notes: 'Plumber who fixed the kitchen sink. Charges a flat call-out fee.',
    },
  ],
  u2: [
    {
      name: 'Priya Raman',
      phone: '+1-555-0201',
      email: 'priya.raman@acme.example',
      notes: 'Project lead at Acme. Weekly sync on Thursdays at 10:00.',
    },
    {
      name: 'Tom Becker',
      phone: '+1-555-0202',
      email: 'tom@beckerautogarage.example',
      notes: 'Mechanic. Ask about winter tyres before November.',
    },
  ],
};

function saveDb(data: Db): void {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function seed(): Db {
  const now = new Date().toISOString();
  const data: Db = { users: [], contacts: [], nextContactId: 1 };
  for (const u of SEED_USERS) {
    data.users.push({ id: u.id, name: u.name, email: u.email, passwordHash: hashPassword(u.password) });
    for (const c of SEED_CONTACTS[u.id] || []) {
      data.contacts.push({ id: data.nextContactId++, userId: u.id, ...c, createdAt: now, updatedAt: now });
    }
  }
  saveDb(data);
  const creds = {
    users: SEED_USERS.map((u) => ({ name: u.name, email: u.email, password: u.password })),
  };
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
  return data;
}

function loadDb(): Db {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Db;
  }
  return seed();
}

if (process.argv.includes('--seed')) {
  const d = seed();
  console.log('Seeded ' + d.users.length + ' users and ' + d.contacts.length + ' contacts.');
  console.log('Wrote ' + path.basename(DATA_FILE) + ' and ' + path.basename(CREDS_FILE));
  process.exit(0);
}

if (!process.env.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET not set, using an insecure development secret.');
}

const db = loadDb();

// ---------- validation ----------

const EMAIL_RE = /^[^@ ]+@[^@ ]+[.][^@ ]+$/;
const LIMITS: Record<string, number> = { name: 200, phone: 50, email: 254, notes: 5000 };

function parseContact(body: any, partial: boolean): { error?: string; value?: Record<string, string> } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const value: Record<string, string> = {};
  for (const key of ['name', 'phone', 'email', 'notes']) {
    const raw = body[key];
    if (raw === undefined) {
      if (!partial) {
        if (key === 'name') return { error: 'name is required' };
        value[key] = '';
      }
      continue;
    }
    if (typeof raw !== 'string') return { error: key + ' must be a string' };
    const v = raw.trim();
    if (key === 'name' && v.length === 0) return { error: 'name must not be empty' };
    if (v.length > LIMITS[key]) return { error: key + ' must be at most ' + LIMITS[key] + ' characters' };
    if (key === 'email' && v.length > 0 && !EMAIL_RE.test(v)) return { error: 'email is not a valid address' };
    value[key] = v;
  }
  return { value };
}

function present(c: Contact) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// ---------- app ----------

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req: any, res: any) => {
  res.json({ status: 'ok' });
});

app.post('/auth/login', (req: any, res: any) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL,
  });
  res.json({ token, expiresIn: TOKEN_TTL });
});

function auth(req: any, res: any, next: any) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user) throw new Error('unknown user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Returns the contact only if it belongs to the authenticated user.
function findOwned(req: any, res: any): Contact | null {
  const raw = String(req.params.id);
  if (!/^[0-9]+$/.test(raw)) {
    res.status(400).json({ error: 'id must be a positive integer' });
    return null;
  }
  const id = Number(raw);
  const contact = db.contacts.find((c) => c.id === id && c.userId === req.user.id);
  if (!contact) {
    res.status(404).json({ error: 'Contact not found' });
    return null;
  }
  return contact;
}

app.get('/contacts', auth, (req: any, res: any) => {
  const mine = db.contacts.filter((c) => c.userId === req.user.id).map(present);
  res.json(mine);
});

app.get('/contacts/:id', auth, (req: any, res: any) => {
  const contact = findOwned(req, res);
  if (contact) res.json(present(contact));
});

app.post('/contacts', auth, (req: any, res: any) => {
  const parsed = parseContact(req.body, false);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const now = new Date().toISOString();
  const v = parsed.value as Record<string, string>;
  const contact: Contact = {
    id: db.nextContactId++,
    userId: req.user.id,
    name: v.name,
    phone: v.phone,
    email: v.email,
    notes: v.notes,
    createdAt: now,
    updatedAt: now,
  };
  db.contacts.push(contact);
  saveDb(db);
  res.status(201).json(present(contact));
});

function update(partial: boolean) {
  return (req: any, res: any) => {
    const contact = findOwned(req, res);
    if (!contact) return;
    const parsed = parseContact(req.body, partial);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    Object.assign(contact, parsed.value);
    contact.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json(present(contact));
  };
}

app.put('/contacts/:id', auth, update(false));
app.patch('/contacts/:id', auth, update(true));

app.delete('/contacts/:id', auth, (req: any, res: any) => {
  const contact = findOwned(req, res);
  if (!contact) return;
  db.contacts = db.contacts.filter((c) => c !== contact);
  saveDb(db);
  res.status(204).end();
});

app.use((_req: any, res: any) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('Contact book listening on http://localhost:' + PORT);
});
