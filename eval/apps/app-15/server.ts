import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface User { id: string; name: string; email: string; salt: string; passwordHash: string }
interface Item { id: string; ownerId: string; name: string; room: string; purchaseDate: string; price: number; serialNumber: string }
interface DB { users: User[]; items: Item[] }

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(DIR, 'data.json');
const CREDS_FILE = path.join(DIR, 'sudarshan.json');
const PORT = Number(process.env.PORT) || 3015;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const SEED_USERS = [
  { name: 'Alice', email: 'alice@example.com', password: 'Alice-Pass-2024!' },
  { name: 'Bob', email: 'bob@example.com', password: 'Bob-Pass-2024!' },
];

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

const DUMMY_SALT = crypto.randomBytes(16).toString('hex');
const DUMMY_HASH = hashPassword('dummy-password', DUMMY_SALT);

function saveDb(db: DB): void {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function seedDb(): DB {
  const users: User[] = SEED_USERS.map((u) => {
    const salt = crypto.randomBytes(16).toString('hex');
    return { id: crypto.randomUUID(), name: u.name, email: u.email, salt, passwordHash: hashPassword(u.password, salt) };
  });
  const [alice, bob] = users;
  const items: Item[] = [
    { id: crypto.randomUUID(), ownerId: alice.id, name: 'Sony Bravia 55 inch TV', room: 'Living Room', purchaseDate: '2022-11-25', price: 799.99, serialNumber: 'SNY-55X80K-100234' },
    { id: crypto.randomUUID(), ownerId: alice.id, name: 'KitchenAid Stand Mixer', room: 'Kitchen', purchaseDate: '2021-03-14', price: 379.0, serialNumber: 'KA-5QT-778812' },
    { id: crypto.randomUUID(), ownerId: bob.id, name: 'DeWalt Cordless Drill', room: 'Garage', purchaseDate: '2023-06-02', price: 129.5, serialNumber: 'DW-20V-554901' },
    { id: crypto.randomUUID(), ownerId: bob.id, name: 'Standing Desk', room: 'Home Office', purchaseDate: '2024-01-18', price: 549.0, serialNumber: 'FLX-DESK-902317' },
  ];
  const db: DB = { users, items };
  saveDb(db);
  fs.writeFileSync(CREDS_FILE, JSON.stringify({ users: SEED_USERS }, null, 2) + '\n');
  return db;
}

function isIsoDate(x: unknown): boolean {
  if (typeof x !== 'string' || x.length !== 10) return false;
  const d = new Date(x + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x;
}

const FIELDS = ['name', 'room', 'purchaseDate', 'price', 'serialNumber'];

function validate(body: any, partial: boolean): { value?: any; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Body must be a JSON object' };
  const v: any = {};
  for (const f of FIELDS) {
    const x = body[f];
    if (x === undefined) {
      if (!partial) return { error: `${f} is required` };
      continue;
    }
    if (f === 'price') {
      if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) return { error: 'price must be a non-negative number' };
      v.price = x;
    } else if (f === 'purchaseDate') {
      if (!isIsoDate(x)) return { error: 'purchaseDate must be a valid date in YYYY-MM-DD format' };
      v.purchaseDate = x;
    } else {
      if (typeof x !== 'string' || x.trim() === '' || x.length > 200) return { error: `${f} must be a non-empty string of at most 200 characters` };
      v[f] = x.trim();
    }
  }
  if (partial && Object.keys(v).length === 0) return { error: 'Provide at least one field to update' };
  return { value: v };
}

function publicItem(i: Item) {
  return { id: i.id, name: i.name, room: i.room, purchaseDate: i.purchaseDate, price: i.price, serialNumber: i.serialNumber };
}

function main(): void {
  if (process.argv.includes('--seed')) {
    seedDb();
    console.log('Seeded data.json and sudarshan.json');
    return;
  }

  if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET not set: using a random secret for this run (tokens will be invalid after restart).');
  }

  const db: DB = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : seedDb();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  function auth(req: any, res: any, next: any) {
    const header: string = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Missing bearer token' });
    try {
      const payload: any = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      const user = db.users.find((u) => u.id === payload.sub);
      if (!user) return res.status(401).json({ error: 'Invalid token' });
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  function findOwned(req: any): Item | undefined {
    return db.items.find((i) => i.id === req.params.id && i.ownerId === req.user.id);
  }

  app.post('/auth/login', (req: any, res: any) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    const computed = Buffer.from(hashPassword(password, user ? user.salt : DUMMY_SALT), 'hex');
    const expected = Buffer.from(user ? user.passwordHash : DUMMY_HASH, 'hex');
    const ok = crypto.timingSafeEqual(computed, expected) && !!user;
    if (!ok || !user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    res.json({ token });
  });

  app.get('/items', auth, (req: any, res: any) => {
    res.json(db.items.filter((i) => i.ownerId === req.user.id).map(publicItem));
  });

  app.get('/items/:id', auth, (req: any, res: any) => {
    const item = findOwned(req);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(publicItem(item));
  });

  app.post('/items', auth, (req: any, res: any) => {
    const { value, error } = validate(req.body, false);
    if (error) return res.status(400).json({ error });
    const item: Item = { id: crypto.randomUUID(), ownerId: req.user.id, ...value };
    db.items.push(item);
    saveDb(db);
    res.status(201).json(publicItem(item));
  });

  function update(partial: boolean) {
    return (req: any, res: any) => {
      const item = findOwned(req);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      const { value, error } = validate(req.body, partial);
      if (error) return res.status(400).json({ error });
      Object.assign(item, value);
      saveDb(db);
      res.json(publicItem(item));
    };
  }
  app.put('/items/:id', auth, update(false));
  app.patch('/items/:id', auth, update(true));

  app.delete('/items/:id', auth, (req: any, res: any) => {
    const item = findOwned(req);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    db.items.splice(db.items.indexOf(item), 1);
    saveDb(db);
    res.status(204).end();
  });

  app.use((_req: any, res: any) => res.status(404).json({ error: 'Not found' }));

  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, () => console.log(`Home inventory API listening on port ${PORT}`));
}

main();
