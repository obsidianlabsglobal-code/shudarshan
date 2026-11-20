import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT) || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
}

interface Expense {
  id: number;
  userId: number;
  amount: number;
  merchant: string;
  date: string;
  category: string;
  note: string;
}

interface Db {
  users: User[];
  expenses: Expense[];
  nextExpenseId: number;
}

// ---------- password hashing (Node built-in scrypt) ----------

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

// ---------- seed data ----------

const SEED_USERS = [
  { id: 1, name: 'Alice', email: 'alice@example.com', password: 'alice-Pass#2024' },
  { id: 2, name: 'Bob', email: 'bob@example.com', password: 'bob-Secret#2024' },
];

function buildSeed(): Db {
  const users: User[] = SEED_USERS.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    passwordHash: hashPassword(u.password),
  }));
  const expenses: Expense[] = [
    { id: 1, userId: 1, amount: 54.87, merchant: 'Green Basket Market', date: '2024-05-03', category: 'Groceries', note: 'Weekly vegetables, oats and olive oil' },
    { id: 2, userId: 1, amount: 12.5, merchant: 'Metro Transit', date: '2024-05-06', category: 'Transport', note: 'Monthly bus top-up' },
    { id: 3, userId: 1, amount: 89.99, merchant: 'Lumen Books', date: '2024-05-11', category: 'Education', note: 'Two TypeScript reference books' },
    { id: 4, userId: 2, amount: 23.4, merchant: 'Blue Door Cafe', date: '2024-05-04', category: 'Dining', note: 'Lunch with coworkers' },
    { id: 5, userId: 2, amount: 120, merchant: 'Peak Fitness', date: '2024-05-01', category: 'Health', note: 'Quarterly gym membership' },
    { id: 6, userId: 2, amount: 39.99, merchant: 'StreamBox', date: '2024-05-09', category: 'Entertainment', note: 'Annual plan, split with roommate' },
  ];
  return { users, expenses, nextExpenseId: 7 };
}

function saveDb(data: Db): void {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
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

if (process.argv.includes('--seed')) {
  saveDb(buildSeed());
  console.log(`Seeded ${DATA_FILE} with users Alice and Bob and their expenses.`);
  process.exit(0);
}

const db: Db = loadDb();

// ---------- validation ----------

function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || s.length !== 10) return false;
  const parts = s.split('-');
  if (parts.length !== 3 || parts[0].length !== 4 || parts[1].length !== 2 || parts[2].length !== 2) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validateExpense(body: any, partial: boolean): { value: Record<string, any> } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const out: Record<string, any> = {};

  if (body.amount !== undefined || !partial) {
    const a = body.amount;
    if (typeof a !== 'number' || !Number.isFinite(a) || a < 0 || a > 1e9) {
      return { error: 'amount must be a non-negative number' };
    }
    out.amount = Math.round(a * 100) / 100;
  }

  const textFields: Array<[string, number]> = [['merchant', 100], ['category', 50]];
  for (const [key, max] of textFields) {
    if (body[key] !== undefined || !partial) {
      const v = typeof body[key] === 'string' ? body[key].trim() : '';
      if (!v || v.length > max) {
        return { error: `${key} is required and must be at most ${max} characters` };
      }
      out[key] = v;
    }
  }

  if (body.date !== undefined || !partial) {
    if (!isValidDate(body.date)) return { error: 'date must be a valid date in YYYY-MM-DD format' };
    out.date = body.date;
  }

  if (body.note !== undefined) {
    if (typeof body.note !== 'string' || body.note.length > 500) {
      return { error: 'note must be a string of at most 500 characters' };
    }
    out.note = body.note.trim();
  } else if (!partial) {
    out.note = '';
  }

  if (partial && Object.keys(out).length === 0) {
    return { error: 'No updatable fields provided' };
  }
  return { value: out };
}

function publicExpense(e: Expense) {
  return { id: e.id, amount: e.amount, merchant: e.merchant, date: e.date, category: e.category, note: e.note };
}

// ---------- app ----------

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

function requireAuth(req: any, res: any, next: any) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload: any = jwt.verify(header.slice(7), JWT_SECRET, { algorithms: ['HS256'] });
    const user = db.users.find((u) => u.id === Number(payload.sub));
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Returns the expense only if it belongs to the authenticated user.
function findOwned(req: any, res: any): Expense | null {
  const raw = String(req.params.id);
  const id = /^[0-9]+$/.test(raw) ? Number(raw) : NaN;
  const expense = Number.isSafeInteger(id)
    ? db.expenses.find((e) => e.id === id && e.userId === req.user.id)
    : undefined;
  if (!expense) {
    res.status(404).json({ error: 'Expense not found' });
    return null;
  }
  return expense;
}

app.get('/health', (_req: any, res: any) => {
  res.json({ status: 'ok' });
});

app.post('/auth/login', (req: any, res: any) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ sub: String(user.id), email: user.email }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
  return res.json({ token });
});

app.get('/expenses', requireAuth, (req: any, res: any) => {
  const list = db.expenses
    .filter((e) => e.userId === req.user.id)
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
    .map(publicExpense);
  res.json(list);
});

app.get('/expenses/:id', requireAuth, (req: any, res: any) => {
  const expense = findOwned(req, res);
  if (expense) res.json(publicExpense(expense));
});

app.post('/expenses', requireAuth, (req: any, res: any) => {
  const result = validateExpense(req.body, false);
  if ('error' in result) return res.status(400).json({ error: result.error });
  const v = result.value;
  const expense: Expense = {
    id: db.nextExpenseId++,
    userId: req.user.id,
    amount: v.amount,
    merchant: v.merchant,
    date: v.date,
    category: v.category,
    note: v.note,
  };
  db.expenses.push(expense);
  saveDb(db);
  res.setHeader('Location', `/expenses/${expense.id}`);
  return res.status(201).json(publicExpense(expense));
});

function updateHandler(partial: boolean) {
  return (req: any, res: any) => {
    const expense = findOwned(req, res);
    if (!expense) return;
    const result = validateExpense(req.body, partial);
    if ('error' in result) return res.status(400).json({ error: result.error });
    Object.assign(expense, result.value);
    saveDb(db);
    return res.json(publicExpense(expense));
  };
}

app.put('/expenses/:id', requireAuth, updateHandler(false));
app.patch('/expenses/:id', requireAuth, updateHandler(true));

app.delete('/expenses/:id', requireAuth, (req: any, res: any) => {
  const expense = findOwned(req, res);
  if (!expense) return;
  db.expenses = db.expenses.filter((e) => e.id !== expense.id);
  saveDb(db);
  res.status(204).end();
});

app.use((_req: any, res: any) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
    return res.status(err.status || 400).json({ error: 'Invalid request body' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Expense log listening on http://localhost:${PORT}`);
});
