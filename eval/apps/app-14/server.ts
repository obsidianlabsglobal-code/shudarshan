import express from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface User { id: string; name: string; email: string; salt: string; hash: string }
interface Client {
  id: string;
  ownerId: string;
  companyName: string;
  contact: string;
  projectSummary: string;
  rate: number;
  meetingNotes: string;
  createdAt: string;
  updatedAt: string;
}
interface DB { users: User[]; clients: Client[] }

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(APP_DIR, 'data.json');
const CREDS_FILE = join(APP_DIR, 'sudarshan.json');
const PORT = Number(process.env.PORT) || 3014;

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET not set: using a random secret for this process (tokens become invalid on restart).');
}
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');

const SEED_USERS = [
  { name: 'Alice', email: 'alice@example.com', password: 'alice-Pass#2024!' },
  { name: 'Bob', email: 'bob@example.org', password: 'bob-Pass#2024!' },
];

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function save(): void {
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function buildSeed(): DB {
  const users: User[] = SEED_USERS.map((u) => {
    const salt = randomBytes(16).toString('hex');
    return { id: randomUUID(), name: u.name, email: u.email, salt, hash: hashPassword(u.password, salt) };
  });
  const [alice, bob] = users;
  const now = new Date().toISOString();
  const mk = (ownerId: string, companyName: string, contact: string, projectSummary: string, rate: number, meetingNotes: string): Client => ({
    id: randomUUID(), ownerId, companyName, contact, projectSummary, rate, meetingNotes, createdAt: now, updatedAt: now,
  });
  const clients: Client[] = [
    mk(alice.id, 'Brightwave Studio', 'Maya Chen <maya@brightwave.example>', 'Marketing website redesign with a new CMS and blog migration.', 85,
      '2024-05-02: Kickoff call. Wants launch before September. Needs brand assets from their designer.'),
    mk(alice.id, 'Northfield Dental', 'Dr. Paul Okafor <paul@northfielddental.example>', 'Online appointment booking with SMS reminders.', 95,
      '2024-05-10: Reviewed current paper process. Prefers weekly Friday check-ins. Budget approved for phase one.'),
    mk(bob.id, 'Kestrel Logistics', 'Ines Duarte <ines@kestrel.example>', 'Internal dashboard showing fleet utilisation and delivery delays.', 120,
      '2024-04-18: Data lives in two legacy systems. Agreed to start with CSV exports. Invoice monthly.'),
    mk(bob.id, 'Lumen Bakery', 'Tom Reyes <tom@lumenbakery.example>', 'Brand refresh and small online shop for pre-orders.', 70,
      '2024-05-06: Likes warm colour palette. Needs shop live before the holiday season. Payment via Stripe.'),
  ];
  return { users, clients };
}

function writeSeed(): DB {
  const fresh = buildSeed();
  writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
  writeFileSync(CREDS_FILE, JSON.stringify({ users: SEED_USERS.map(({ name, email, password }) => ({ name, email, password })) }, null, 2) + '\n');
  return fresh;
}

let db: DB;
if (process.argv.includes('--seed')) {
  db = writeSeed();
  console.log(`Seeded ${db.users.length} users and ${db.clients.length} clients into ${DB_FILE}`);
  process.exit(0);
}
db = existsSync(DB_FILE) ? (JSON.parse(readFileSync(DB_FILE, 'utf8')) as DB) : writeSeed();

const LIMITS: Record<string, number> = { companyName: 200, contact: 200, projectSummary: 5000, meetingNotes: 20000 };
const REQUIRED = ['companyName', 'contact'];

function parseClient(body: any, partial: boolean): { error?: string; value?: any } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'JSON object body required' };
  const out: any = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    const v = body[key];
    if (v === undefined) {
      if (!partial && REQUIRED.includes(key)) return { error: `${key} is required` };
      continue;
    }
    if (typeof v !== 'string' || v.length > max) return { error: `${key} must be a string up to ${max} characters` };
    if (REQUIRED.includes(key) && v.trim() === '') return { error: `${key} must not be empty` };
    out[key] = v;
  }
  if (body.rate === undefined) {
    if (!partial) return { error: 'rate is required' };
  } else if (typeof body.rate !== 'number' || !Number.isFinite(body.rate) || body.rate < 0 || body.rate > 1000000) {
    return { error: 'rate must be a non-negative number' };
  } else {
    out.rate = body.rate;
  }
  if (partial && Object.keys(out).length === 0) return { error: 'No updatable fields provided' };
  return { value: out };
}

function toPublic(c: Client) {
  const { ownerId, ...rest } = c;
  return rest;
}

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

function findOwned(req: any): Client | undefined {
  return db.clients.find((c) => c.id === req.params.id && c.ownerId === req.userId);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.post('/auth/login', (req: any, res: any) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  const salt = user ? user.salt : 'ffffffffffffffffffffffffffffffff';
  const attempt = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(user ? user.hash : '00'.repeat(64), 'hex');
  if (!user || !timingSafeEqual(attempt, expected)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  res.json({ token });
});

app.use('/clients', requireAuth);

app.get('/clients', (req: any, res: any) => {
  res.json(db.clients.filter((c) => c.ownerId === req.userId).map(toPublic));
});

app.get('/clients/:id', (req: any, res: any) => {
  const client = findOwned(req);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(toPublic(client));
});

app.post('/clients', (req: any, res: any) => {
  const { error, value } = parseClient(req.body, false);
  if (error) return res.status(400).json({ error });
  const now = new Date().toISOString();
  const client: Client = {
    id: randomUUID(),
    ownerId: req.userId,
    projectSummary: '',
    meetingNotes: '',
    ...value,
    createdAt: now,
    updatedAt: now,
  };
  db.clients.push(client);
  save();
  res.status(201).json(toPublic(client));
});

function update(partial: boolean) {
  return (req: any, res: any) => {
    const client = findOwned(req);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const { error, value } = parseClient(req.body, partial);
    if (error) return res.status(400).json({ error });
    const next = partial ? value : { projectSummary: '', meetingNotes: '', ...value };
    Object.assign(client, next, { updatedAt: new Date().toISOString() });
    save();
    res.json(toPublic(client));
  };
}
app.put('/clients/:id', update(false));
app.patch('/clients/:id', update(true));

app.delete('/clients/:id', (req: any, res: any) => {
  const client = findOwned(req);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  db.clients = db.clients.filter((c) => c.id !== client.id);
  save();
  res.status(204).end();
});

app.use((_req: any, res: any) => res.status(404).json({ error: 'Not found' }));

app.use((err: any, _req: any, res: any, _next: any) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Client notes API listening on port ${PORT}`);
});
