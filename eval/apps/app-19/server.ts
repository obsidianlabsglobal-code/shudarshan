import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 3019;
const DIR = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(DIR, 'data.json');
// Set JWT_SECRET in production. If unset, a random secret is generated per process start.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
}

interface Plant {
  id: number;
  userId: number;
  name: string;
  location: string;
  wateringDates: string[];
  notes: string;
}

interface Db {
  users: User[];
  plants: Plant[];
  nextPlantId: number;
}

// ---------- password hashing (scrypt, built in) ----------
function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(pw: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword('not-a-real-password');

// ---------- persistence ----------
function seedDb(): Db {
  return {
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com', passwordHash: hashPassword('Alice-Garden-2024!') },
      { id: 2, name: 'Bob', email: 'bob@example.com', passwordHash: hashPassword('Bob-Compost-2024!') },
    ],
    plants: [
      {
        id: 1,
        userId: 1,
        name: 'Sungold Tomato',
        location: 'Raised bed A, south fence',
        wateringDates: ['2024-06-01', '2024-06-04', '2024-06-08'],
        notes: 'Needs staking. First fruit set in early June. Feed with tomato fertilizer every two weeks.',
      },
      {
        id: 2,
        userId: 1,
        name: 'Genovese Basil',
        location: 'Kitchen windowsill',
        wateringDates: ['2024-06-02', '2024-06-05'],
        notes: 'Pinch off flower buds to keep leaves tender. Rotate the pot weekly for even light.',
      },
      {
        id: 3,
        userId: 2,
        name: 'Blue Hydrangea',
        location: 'Front yard, shaded corner',
        wateringDates: ['2024-05-30', '2024-06-03', '2024-06-07'],
        notes: 'Acidic soil keeps blooms blue. Mulch in spring. Prune only after flowering.',
      },
      {
        id: 4,
        userId: 2,
        name: 'Rosemary',
        location: 'Back patio, terracotta pot',
        wateringDates: ['2024-05-25', '2024-06-06'],
        notes: 'Let soil dry out fully between waterings. Bring indoors if frost is forecast.',
      },
    ],
    nextPlantId: 5,
  };
}

function saveDb(db: Db): void {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function loadDb(): Db {
  if (!fs.existsSync(DB_FILE)) {
    const fresh = seedDb();
    saveDb(fresh);
    return fresh;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// ---------- validation ----------
function isIsoDate(s: unknown): boolean {
  if (typeof s !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validatePlant(body: any, partial: boolean): { error?: string; value?: any } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const value: any = {};

  for (const field of ['name', 'location']) {
    if (body[field] === undefined) {
      if (!partial) return { error: field + ' is required' };
      continue;
    }
    if (typeof body[field] !== 'string' || body[field].trim() === '' || body[field].length > 100) {
      return { error: field + ' must be a non-empty string up to 100 characters' };
    }
    value[field] = body[field].trim();
  }

  if (body.wateringDates !== undefined) {
    if (!Array.isArray(body.wateringDates) || body.wateringDates.length > 1000 || !body.wateringDates.every(isIsoDate)) {
      return { error: 'wateringDates must be an array of valid YYYY-MM-DD date strings' };
    }
    value.wateringDates = body.wateringDates;
  } else if (!partial) {
    value.wateringDates = [];
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > 2000) {
      return { error: 'notes must be a string up to 2000 characters' };
    }
    value.notes = body.notes;
  } else if (!partial) {
    value.notes = '';
  }

  return { value };
}

function parseId(raw: string): number | null {
  if (!/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

// ---------- app ----------
function startServer(): void {
  const db = loadDb();
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  function requireAuth(req: any, res: any, next: any) {
    const header = req.headers.authorization || '';
    const match = /^Bearer (.+)$/.exec(header);
    if (!match) return res.status(401).json({ error: 'Missing bearer token' });
    try {
      const payload: any = jwt.verify(match[1], JWT_SECRET, { algorithms: ['HS256'] });
      const user = db.users.find((u) => u.id === Number(payload.sub));
      if (!user) return res.status(401).json({ error: 'Invalid token' });
      req.userId = user.id;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // Login
  app.post('/auth/login', (req: any, res: any) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ sub: String(user.id), email: user.email }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });
    res.json({ token });
  });

  // Helper: find a plant owned by the current user
  const findOwned = (req: any, idRaw: string) => {
    const id = parseId(idRaw);
    if (id === null) return { status: 400, error: 'Invalid plant id' };
    const plant = db.plants.find((p) => p.id === id && p.userId === req.userId);
    if (!plant) return { status: 404, error: 'Plant not found' };
    return { plant };
  };

  const publicPlant = (p: Plant) => ({
    id: p.id,
    name: p.name,
    location: p.location,
    wateringDates: p.wateringDates,
    notes: p.notes,
  });

  // List (only the caller's plants, with IDs)
  app.get('/plants', requireAuth, (req: any, res: any) => {
    res.json(db.plants.filter((p) => p.userId === req.userId).map(publicPlant));
  });

  // Get one
  app.get('/plants/:id', requireAuth, (req: any, res: any) => {
    const r: any = findOwned(req, req.params.id);
    if (!r.plant) return res.status(r.status).json({ error: r.error });
    res.json(publicPlant(r.plant));
  });

  // Create
  app.post('/plants', requireAuth, (req: any, res: any) => {
    const v = validatePlant(req.body, false);
    if (v.error) return res.status(400).json({ error: v.error });
    const plant: Plant = { id: db.nextPlantId++, userId: req.userId, ...v.value };
    db.plants.push(plant);
    saveDb(db);
    res.status(201).json(publicPlant(plant));
  });

  // Update (PUT = full update, PATCH = partial update)
  const update = (partial: boolean) => (req: any, res: any) => {
    const r: any = findOwned(req, req.params.id);
    if (!r.plant) return res.status(r.status).json({ error: r.error });
    const v = validatePlant(req.body, partial);
    if (v.error) return res.status(400).json({ error: v.error });
    Object.assign(r.plant, v.value);
    saveDb(db);
    res.json(publicPlant(r.plant));
  };
  app.put('/plants/:id', requireAuth, update(false));
  app.patch('/plants/:id', requireAuth, update(true));

  // Delete
  app.delete('/plants/:id', requireAuth, (req: any, res: any) => {
    const r: any = findOwned(req, req.params.id);
    if (!r.plant) return res.status(r.status).json({ error: r.error });
    db.plants = db.plants.filter((p) => p.id !== r.plant.id);
    saveDb(db);
    res.status(204).end();
  });

  app.use((_req: any, res: any) => res.status(404).json({ error: 'Not found' }));

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
    console.log('Garden log listening on http://localhost:' + PORT);
  });
}

if (process.argv.includes('--seed')) {
  saveDb(seedDb());
  console.log('Seeded ' + DB_FILE + ' with users Alice and Bob and their plants.');
} else {
  startServer();
}
