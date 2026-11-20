import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = Number(process.env.PORT) || 3005;
// Set JWT_SECRET in real deployments. If unset, a random secret is generated per process start.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

interface User { id: number; name: string; email: string; passwordHash: string }
interface Meal { id: number; userId: number; date: string; mealSlot: string; dishName: string; prepNote: string }
interface Db { users: User[]; meals: Meal[]; nextMealId: number }

function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}

function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(pw, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

function buildSeed(): Db {
  return {
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com', passwordHash: hashPassword('Alice-Pass-2024!') },
      { id: 2, name: 'Bob', email: 'bob@example.com', passwordHash: hashPassword('Bob-Pass-2024!') },
    ],
    meals: [
      { id: 1, userId: 1, date: '2025-01-06', mealSlot: 'dinner', dishName: 'Lemon Herb Roast Chicken', prepNote: 'Marinate chicken overnight with lemon, thyme and garlic; roast at 200C for 45 minutes.' },
      { id: 2, userId: 1, date: '2025-01-07', mealSlot: 'breakfast', dishName: 'Overnight Oats with Berries', prepNote: 'Soak oats in almond milk the night before; top with fresh berries.' },
      { id: 3, userId: 2, date: '2025-01-06', mealSlot: 'lunch', dishName: 'Chickpea Spinach Curry', prepNote: 'Use canned chickpeas; simmer 20 minutes and serve with rice.' },
      { id: 4, userId: 2, date: '2025-01-08', mealSlot: 'dinner', dishName: 'Beef Tacos', prepNote: 'Brown the mince with spices; prep salsa and shred lettuce ahead of time.' },
    ],
    nextMealId: 5,
  };
}

function saveDb(data: Db): void {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function loadDb(): Db {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = buildSeed();
    saveDb(seed);
    return seed;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Db;
}

if (process.argv.includes('--seed')) {
  saveDb(buildSeed());
  console.log('Seeded ' + DATA_FILE + ' with users Alice and Bob and 4 meals.');
  process.exit(0);
}

const db: Db = loadDb();

function isValidDate(s: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validateMeal(body: any, partial: boolean): { error?: string; value?: any } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const out: any = {};
  if (!partial || body.date !== undefined) {
    if (typeof body.date !== 'string' || !isValidDate(body.date)) {
      return { error: 'date must be a valid YYYY-MM-DD string' };
    }
    out.date = body.date;
  }
  if (!partial || body.mealSlot !== undefined) {
    if (typeof body.mealSlot !== 'string' || !SLOTS.includes(body.mealSlot)) {
      return { error: 'mealSlot must be one of: ' + SLOTS.join(', ') };
    }
    out.mealSlot = body.mealSlot;
  }
  if (!partial || body.dishName !== undefined) {
    if (typeof body.dishName !== 'string' || body.dishName.trim().length < 1 || body.dishName.trim().length > 120) {
      return { error: 'dishName must be a string of 1 to 120 characters' };
    }
    out.dishName = body.dishName.trim();
  }
  if (body.prepNote !== undefined) {
    if (typeof body.prepNote !== 'string' || body.prepNote.length > 500) {
      return { error: 'prepNote must be a string of at most 500 characters' };
    }
    out.prepNote = body.prepNote;
  } else if (!partial) {
    out.prepNote = '';
  }
  if (partial && Object.keys(out).length === 0) {
    return { error: 'No updatable fields provided' };
  }
  return { value: out };
}

function publicMeal(m: Meal) {
  return { id: m.id, date: m.date, mealSlot: m.mealSlot, dishName: m.dishName, prepNote: m.prepNote };
}

function auth(req: any, res: any, next: any) {
  const header = String(req.headers.authorization || '');
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload: any = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const user = db.users.find((u) => u.id === Number(payload.sub));
    if (!user) throw new Error('unknown user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function findOwnMeal(req: any): Meal | undefined {
  if (!/^[0-9]+$/.test(String(req.params.id))) return undefined;
  const id = Number(req.params.id);
  return db.meals.find((m) => m.id === id && m.userId === req.user.id);
}

const SLOT_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };

const app = express();
app.use(express.json({ limit: '10kb' }));

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
  const token = jwt.sign({ sub: String(user.id), name: user.name }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  res.json({ token });
});

app.get('/meals', auth, (req: any, res: any) => {
  let list = db.meals.filter((m) => m.userId === req.user.id);
  const { from, to } = req.query;
  if (from !== undefined) {
    if (typeof from !== 'string' || !isValidDate(from)) {
      return res.status(400).json({ error: 'from must be a valid YYYY-MM-DD string' });
    }
    list = list.filter((m) => m.date >= from);
  }
  if (to !== undefined) {
    if (typeof to !== 'string' || !isValidDate(to)) {
      return res.status(400).json({ error: 'to must be a valid YYYY-MM-DD string' });
    }
    list = list.filter((m) => m.date <= to);
  }
  list.sort((a, b) => a.date.localeCompare(b.date) || SLOT_ORDER[a.mealSlot] - SLOT_ORDER[b.mealSlot] || a.id - b.id);
  res.json(list.map(publicMeal));
});

app.get('/meals/:id', auth, (req: any, res: any) => {
  const meal = findOwnMeal(req);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });
  res.json(publicMeal(meal));
});

app.post('/meals', auth, (req: any, res: any) => {
  const { error, value } = validateMeal(req.body, false);
  if (error) return res.status(400).json({ error });
  const meal: Meal = { id: db.nextMealId++, userId: req.user.id, ...value };
  db.meals.push(meal);
  saveDb(db);
  res.status(201).location('/meals/' + meal.id).json(publicMeal(meal));
});

function updateHandler(partial: boolean) {
  return (req: any, res: any) => {
    const meal = findOwnMeal(req);
    if (!meal) return res.status(404).json({ error: 'Meal not found' });
    const { error, value } = validateMeal(req.body, partial);
    if (error) return res.status(400).json({ error });
    Object.assign(meal, value);
    saveDb(db);
    res.json(publicMeal(meal));
  };
}

app.put('/meals/:id', auth, updateHandler(false));
app.patch('/meals/:id', auth, updateHandler(true));

app.delete('/meals/:id', auth, (req: any, res: any) => {
  const meal = findOwnMeal(req);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });
  db.meals.splice(db.meals.indexOf(meal), 1);
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
  console.log('Meal planner listening on port ' + PORT);
});
