import express from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Minimal local types (no @types packages are installed; tsx does not type-check).
type Req = any;
type Res = any;

interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
}

interface Recipe {
  id: number;
  ownerId: number;
  name: string;
  ingredients: string[];
  steps: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface Db {
  users: User[];
  recipes: Recipe[];
  nextRecipeId: number;
}

const PORT = Number(process.env.PORT) || 3012;
// If JWT_SECRET is not set, a random per-process secret is used (tokens are invalidated on restart).
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
const DATA_FILE = path.join(__dirname, 'data.json');

// ---------- password hashing (scrypt, built into Node) ----------
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

const DUMMY_HASH = hashPassword('not-a-real-password');

// ---------- storage (JSON file) ----------
function buildSeed(): Db {
  const now = new Date().toISOString();
  const users: User[] = [
    { id: 1, name: 'Alice', email: 'alice@example.com', passwordHash: hashPassword('Alice-Pass-2024!') },
    { id: 2, name: 'Bob', email: 'bob@example.com', passwordHash: hashPassword('Bob-Pass-2024!') },
  ];
  const recipes: Recipe[] = [
    {
      id: 1,
      ownerId: 1,
      name: 'Lemon Garlic Roast Chicken',
      ingredients: ['1 whole chicken (about 1.8 kg)', '1 lemon, halved', '6 garlic cloves, smashed', '3 tbsp butter, softened', '1 tbsp fresh thyme', 'Salt and black pepper'],
      steps: ['Heat the oven to 220C / 425F.', 'Pat the chicken dry and rub with butter, thyme, salt, and pepper.', 'Stuff the cavity with lemon and garlic.', 'Roast for 1 hour 10 minutes until the juices run clear.', 'Rest for 15 minutes before carving.'],
      notes: 'Dry the skin well for crispiness. Grandma always added a splash of white wine to the pan.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      ownerId: 1,
      name: 'Brown Butter Banana Bread',
      ingredients: ['3 ripe bananas', '115 g butter', '150 g brown sugar', '2 eggs', '190 g all-purpose flour', '1 tsp baking soda', '1/2 tsp salt', '1 tsp vanilla extract'],
      steps: ['Brown the butter in a saucepan and let it cool slightly.', 'Mash the bananas and whisk in butter, sugar, eggs, and vanilla.', 'Fold in flour, baking soda, and salt until just combined.', 'Bake in a lined loaf pan at 175C /350F for 55 minutes.'],
      notes: 'Add a handful of toasted walnuts. Freezes well sliced.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 3,
      ownerId: 2,
      name: 'Smoky Black Bean Chili',
      ingredients: ['2 cans black beans, drained', '1 onion, diced', '2 bell peppers, chopped', '1 can crushed tomatoes (400 g)', '2 tsp smoked paprika', '1 tsp cumin', '1 chipotle pepper in adobo', '2 cups vegetable stock'],
      steps: ['Saute onion and peppers in oil until soft.', 'Stir in the spices and chipotle for 1 minute.', 'Add tomatoes, beans, and stock.', 'Simmer for 40 minutes, stirring occasionally.', 'Season with salt and lime juice.'],
      notes: 'Even better the next day. Serve with avocado and a spoon of yogurt.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 4,
      ownerId: 2,
      name: 'Weeknight Tomato Basil Pasta',
      ingredients: ['400 g spaghetti', '500 g cherry tomatoes', '4 garlic cloves, sliced', '1/3 cup olive oil', 'A large handful of basil', 'Parmesan, to serve'],
      steps: ['Boil the spaghetti in well-salted water.', 'Cook garlic and tomatoes in olive oil until the tomatoes burst, about 10 minutes.', 'Toss in the drained pasta with a splash of pasta water.', 'Finish with torn basil and Parmesan.'],
      notes: 'Ready in 20 minutes. Add chili flakes when cooking for friends who like heat.',
      createdAt: now,
      updatedAt: now,
    },
  ];
  return { users, recipes, nextRecipeId: recipes.length + 1 };
}

function saveDb(data: Db): void {
  const tmp = DATA_FILE + '.tmp';
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

// ---------- seed command ----------
if (process.argv.includes('--seed')) {
  saveDb(buildSeed());
  console.log('Seeded ' + DATA_FILE + ' with users alice@example.com and bob@example.com');
  process.exit(0);
}

const db: Db = loadDb();

// ---------- helpers ----------
function toPublic(r: Recipe) {
  return {
    id: r.id,
    name: r.name,
    ingredients: r.ingredients,
    steps: r.steps,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function validateRecipe(body: any, partial: boolean): { value?: any; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const out: any = {};
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) {
      return { error: 'name must be a non-empty string up to 200 characters' };
    }
    out.name = body.name.trim();
  }
  for (const key of ['ingredients', 'steps']) {
    if (!partial || body[key] !== undefined) {
      const v = body[key];
      const ok =
        Array.isArray(v) &&
        v.length > 0 &&
        v.length <= 100 &&
        v.every((s: any) => typeof s === 'string' && s.trim().length > 0 && s.length <= 500);
      if (!ok) {
        return { error: key + ' must be a non-empty array (max 100) of non-empty strings (max 500 chars each)' };
      }
      out[key] = v.map((s: string) => s.trim());
    }
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > 5000) {
      return { error: 'notes must be a string up to 5000 characters' };
    }
    out.notes = body.notes;
  } else if (!partial) {
    out.notes = '';
  }
  return { value: out };
}

function findOwned(userId: number, idParam: string): Recipe | undefined {
  if (!/^[0-9]+$/.test(idParam)) return undefined;
  const id = Number(idParam);
  return db.recipes.find((r) => r.id === id && r.ownerId === userId);
}

// ---------- auth ----------
function requireAuth(req: Req, res: Res, next: () => void) {
  const header = String(req.headers.authorization || '');
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload: any = jwt.verify(match[1], JWT_SECRET, { algorithms: ['HS256'] });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || !db.users.some((u) => u.id === userId)) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.userId = userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Simple in-memory limiter for failed logins (per IP + email).
const failedLogins = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.post('/auth/login', (req: Req, res: Res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const key = req.ip + '|' + email;
  const now = Date.now();
  const entry = failedLogins.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILS) {
    return res.status(429).json({ error: 'Too many failed attempts, try again later' });
  }

  const user = db.users.find((u) => u.email.toLowerCase() === email);
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const valid = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !valid) {
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + WINDOW_MS };
    current.count += 1;
    failedLogins.set(key, current);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  failedLogins.delete(key);
  const token = jwt.sign({ sub: String(user.id), name: user.name }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// List the caller's recipes (IDs included)
app.get('/recipes', requireAuth, (req: Req, res: Res) => {
  res.json(db.recipes.filter((r) => r.ownerId === req.userId).map(toPublic));
});

// Get one by ID
app.get('/recipes/:id', requireAuth, (req: Req, res: Res) => {
  const recipe = findOwned(req.userId, req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  res.json(toPublic(recipe));
});

// Create
app.post('/recipes', requireAuth, (req: Req, res: Res) => {
  const { value, error } = validateRecipe(req.body, false);
  if (error) return res.status(400).json({ error });
  const now = new Date().toISOString();
  const recipe: Recipe = {
    id: db.nextRecipeId++,
    ownerId: req.userId,
    name: value.name,
    ingredients: value.ingredients,
    steps: value.steps,
    notes: value.notes,
    createdAt: now,
    updatedAt: now,
  };
  db.recipes.push(recipe);
  saveDb(db);
  res.status(201).location('/recipes/' + recipe.id).json(toPublic(recipe));
});

// Update (PUT replaces fields, PATCH updates only the supplied fields)
function updateHandler(partial: boolean) {
  return (req: Req, res: Res) => {
    const recipe = findOwned(req.userId, req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    const { value, error } = validateRecipe(req.body, partial);
    if (error) return res.status(400).json({ error });
    Object.assign(recipe, value, { updatedAt: new Date().toISOString() });
    saveDb(db);
    res.json(toPublic(recipe));
  };
}
app.put('/recipes/:id', requireAuth, updateHandler(false));
app.patch('/recipes/:id', requireAuth, updateHandler(true));

// Delete
app.delete('/recipes/:id', requireAuth, (req: Req, res: Res) => {
  const recipe = findOwned(req.userId, req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  db.recipes.splice(db.recipes.indexOf(recipe), 1);
  saveDb(db);
  res.status(204).end();
});

app.use((_req: Req, res: Res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: Req, res: Res, _next: () => void) => {
  if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
    return res.status(err.status || 400).json({ error: 'Invalid request body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('Recipe box listening on http://localhost:' + PORT);
});
