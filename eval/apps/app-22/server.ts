import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT) || 3022;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const DATA_FILE = path.join(__dirname, 'data.json');
const STATUSES = ['unpaid', 'paid', 'overdue'];

interface User {
  id: string;
  name: string;
  email: string;
  salt: string;
  passwordHash: string;
}

interface Bill {
  id: string;
  userId: string;
  provider: string;
  amount: number;
  dueDate: string;
  paymentStatus: string;
  referenceNumber: string;
}

interface Db {
  users: User[];
  bills: Bill[];
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function makeUser(name: string, email: string, password: string): User {
  const salt = randomBytes(16).toString('hex');
  return { id: randomUUID(), name, email: email.toLowerCase(), salt, passwordHash: hashPassword(password, salt) };
}

function buildSeed(): Db {
  const alice = makeUser('Alice', 'alice@example.com', 'alice-Pass#2025');
  const bob = makeUser('Bob', 'bob@example.com', 'bob-Secret#2025');
  const bills: Bill[] = [
    { id: randomUUID(), userId: alice.id, provider: 'Pacific Power & Light', amount: 128.45, dueDate: '2025-07-15', paymentStatus: 'unpaid', referenceNumber: 'PPL-883201' },
    { id: randomUUID(), userId: alice.id, provider: 'Evergreen Water District', amount: 54.2, dueDate: '2025-06-28', paymentStatus: 'paid', referenceNumber: 'EWD-2025-0612' },
    { id: randomUUID(), userId: bob.id, provider: 'Metro Fiber Internet', amount: 79.99, dueDate: '2025-07-03', paymentStatus: 'unpaid', referenceNumber: 'MFI-5521907' },
    { id: randomUUID(), userId: bob.id, provider: 'Lakeside Auto Insurance', amount: 212.0, dueDate: '2025-05-30', paymentStatus: 'overdue', referenceNumber: 'LKS-AUTO-77410' },
  ];
  return { users: [alice, bob], bills };
}

function save(data: Db): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function load(): Db {
  if (!fs.existsSync(DATA_FILE)) {
    const seeded = buildSeed();
    save(seeded);
    return seeded;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Db;
}

if (process.argv.includes('--seed')) {
  save(buildSeed());
  console.log(`Seeded ${DATA_FILE} with users alice@example.com and bob@example.com`);
  process.exit(0);
}

const db = load();

function publicBill(b: Bill) {
  return {
    id: b.id,
    provider: b.provider,
    amount: b.amount,
    dueDate: b.dueDate,
    paymentStatus: b.paymentStatus,
    referenceNumber: b.referenceNumber,
  };
}

function isValidDate(value: string): boolean {
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Validates only known fields. When partial is false, required fields must be present.
function parseBill(body: any, partial: boolean): { value?: any; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'JSON object body required' };
  }
  const out: any = {};

  if (body.provider !== undefined) {
    if (typeof body.provider !== 'string' || !body.provider.trim() || body.provider.length > 100) {
      return { error: 'provider must be a non-empty string up to 100 characters' };
    }
    out.provider = body.provider.trim();
  }
  if (body.amount !== undefined) {
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount < 0) {
      return { error: 'amount must be a non-negative number' };
    }
    out.amount = body.amount;
  }
  if (body.dueDate !== undefined) {
    if (typeof body.dueDate !== 'string' || !isValidDate(body.dueDate)) {
      return { error: 'dueDate must be a valid date in YYYY-MM-DD format' };
    }
    out.dueDate = body.dueDate;
  }
  if (body.paymentStatus !== undefined) {
    if (typeof body.paymentStatus !== 'string' || !STATUSES.includes(body.paymentStatus)) {
      return { error: 'paymentStatus must be one of: ' + STATUSES.join(', ') };
    }
    out.paymentStatus = body.paymentStatus;
  }
  if (body.referenceNumber !== undefined) {
    if (typeof body.referenceNumber !== 'string' || !body.referenceNumber.trim() || body.referenceNumber.length > 64) {
      return { error: 'referenceNumber must be a non-empty string up to 64 characters' };
    }
    out.referenceNumber = body.referenceNumber.trim();
  }

  if (partial) {
    if (Object.keys(out).length === 0) return { error: 'No updatable fields provided' };
  } else {
    for (const f of ['provider', 'amount', 'dueDate', 'referenceNumber']) {
      if (out[f] === undefined) return { error: f + ' is required' };
    }
    if (out.paymentStatus === undefined) out.paymentStatus = 'unpaid';
  }
  return { value: out };
}

function auth(req: any, res: any, next: any) {
  const header: string = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload: any = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const app = express();
app.use(express.json({ limit: '10kb' }));

app.post('/auth/login', (req: any, res: any) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = db.users.find((u) => u.email === email.toLowerCase());
  const salt = user ? user.salt : '00000000000000000000000000000000';
  const candidate = Buffer.from(hashPassword(password, salt), 'hex');
  const stored = Buffer.from(user ? user.passwordHash : hashPassword('dummy', salt), 'hex');
  const ok = timingSafeEqual(candidate, stored) && !!user;
  if (!ok || !user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  res.json({ token });
});

app.get('/bills', auth, (req: any, res: any) => {
  const mine = db.bills.filter((b) => b.userId === req.userId).map(publicBill);
  res.json(mine);
});

app.get('/bills/:id', auth, (req: any, res: any) => {
  const bill = db.bills.find((b) => b.id === req.params.id && b.userId === req.userId);
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  res.json(publicBill(bill));
});

app.post('/bills', auth, (req: any, res: any) => {
  const { value, error } = parseBill(req.body, false);
  if (error) return res.status(400).json({ error });
  const bill: Bill = { id: randomUUID(), userId: req.userId, ...value };
  db.bills.push(bill);
  save(db);
  res.status(201).json(publicBill(bill));
});

function updateBill(req: any, res: any) {
  const bill = db.bills.find((b) => b.id === req.params.id && b.userId === req.userId);
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  const { value, error } = parseBill(req.body, true);
  if (error) return res.status(400).json({ error });
  Object.assign(bill, value);
  save(db);
  res.json(publicBill(bill));
}
app.put('/bills/:id', auth, updateBill);
app.patch('/bills/:id', auth, updateBill);

app.delete('/bills/:id', auth, (req: any, res: any) => {
  const idx = db.bills.findIndex((b) => b.id === req.params.id && b.userId === req.userId);
  if (idx === -1) return res.status(404).json({ error: 'Bill not found' });
  db.bills.splice(idx, 1);
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
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Bill tracker listening on port ${PORT}`);
});
