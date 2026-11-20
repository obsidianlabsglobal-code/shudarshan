import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

interface Goal {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  createdAt: string;
  updatedAt: string;
}

interface Db {
  users: User[];
  goals: Goal[];
}

type GoalFields = Pick<Goal, 'name' | 'targetAmount' | 'currentAmount' | 'deadline'>;

const PORT = Number(process.env.PORT) || 3011;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const DATA_FILE = process.env.DATA_FILE || join(__dirname, 'data.json');
const CREDENTIALS_FILE = join(__dirname, 'sudarshan.json');

const SEED_USERS = [
  { name: 'Alice', email: 'alice@example.com', password: 'AliceSaves#2024' },
  { name: 'Bob', email: 'bob@example.com', password: 'BobSaves#2024' },
];

// ---------- password hashing (Node built-in scrypt) ----------

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword('not-a-real-password');

// ---------- storage ----------

function saveDb(data: Db): void {
  const tmp = DATA_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, DATA_FILE);
}

function seed(): Db {
  const now = new Date().toISOString();
  const users: User[] = SEED_USERS.map((u) => ({
    id: randomUUID(),
    name: u.name,
    email: u.email,
    passwordHash: hashPassword(u.password),
  }));
  const [alice, bob] = users;
  const mk = (
    userId: string,
    name: string,
    targetAmount: number,
    currentAmount: number,
    deadline: string,
  ): Goal => ({
    id: randomUUID(),
    userId,
    name,
    targetAmount,
    currentAmount,
    deadline,
    createdAt: now,
    updatedAt: now,
  });
  const data: Db = {
    users,
    goals: [
      mk(alice.id, 'Emergency Fund', 10000, 4200, '2026-12-31'),
      mk(alice.id, 'Japan Trip', 3500, 1250, '2026-04-15'),
      mk(bob.id, 'New Laptop', 1800, 650, '2026-09-01'),
      mk(bob.id, 'Home Down Payment', 50000, 12500, '2028-06-30'),
    ],
  };
  saveDb(data);
  writeFileSync(
    CREDENTIALS_FILE,
    JSON.stringify(
      { users: SEED_USERS.map(({ name, email, password }) => ({ name, email, password })) },
      null,
      2,
    ) + '\n',
  );
  return data;
}

function loadDb(): Db {
  if (!existsSync(DATA_FILE)) return seed();
  return JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Db;
}

// ---------- validation ----------

function isValidDate(s: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validateGoal(
  body: unknown,
  base: GoalFields | null,
): { value: GoalFields } | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const b = body as Record<string, unknown>;
  const merged: Record<string, unknown> = base ? { ...base } : { currentAmount: 0 };
  for (const key of ['name', 'targetAmount', 'currentAmount', 'deadline']) {
    if (b[key] !== undefined) merged[key] = b[key];
  }
  const { name, targetAmount, currentAmount, deadline } = merged;

  if (typeof name !== 'string' || name.trim() === '' || name.trim().length > 200) {
    return { error: 'name must be a non-empty string of at most 200 characters' };
  }
  if (
    typeof targetAmount !== 'number' ||
    !Number.isFinite(targetAmount) ||
    targetAmount <= 0 ||
    targetAmount > 1e12
  ) {
    return { error: 'targetAmount must be a number greater than 0' };
  }
  if (
    typeof currentAmount !== 'number' ||
    !Number.isFinite(currentAmount) ||
    currentAmount < 0 ||
    currentAmount > 1e12
  ) {
    return { error: 'currentAmount must be a number greater than or equal to 0' };
  }
  if (typeof deadline !== 'string' || !isValidDate(deadline)) {
    return { error: 'deadline must be a valid date in YYYY-MM-DD format' };
  }
  return { value: { name: name.trim(), targetAmount, currentAmount, deadline } };
}

function toPublic(g: Goal) {
  return {
    id: g.id,
    name: g.name,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount,
    deadline: g.deadline,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

// ---------- app ----------

function createApp(db: Db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      const user = db.users.find((u) => u.id === payload.sub);
      if (!user) return res.status(401).json({ error: 'Invalid token' });
      res.locals.userId = user.id;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  function findOwnGoal(req: Request, res: Response): Goal | undefined {
    return db.goals.find((g) => g.id === req.params.id && g.userId === res.locals.userId);
  }

  app.post('/auth/login', (req: Request, res: Response) => {
    const { email, password } = (req.body || {}) as { email?: unknown; password?: unknown };
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ email: user.email }, JWT_SECRET, {
      subject: user.id,
      expiresIn: '1h',
      algorithm: 'HS256',
    });
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  });

  app.get('/goals', requireAuth, (_req: Request, res: Response) => {
    const mine = db.goals.filter((g) => g.userId === res.locals.userId);
    res.json(mine.map(toPublic));
  });

  app.get('/goals/:id', requireAuth, (req: Request, res: Response) => {
    const goal = findOwnGoal(req, res);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    return res.json(toPublic(goal));
  });

  app.post('/goals', requireAuth, (req: Request, res: Response) => {
    const result = validateGoal(req.body, null);
    if ('error' in result) return res.status(400).json({ error: result.error });
    const now = new Date().toISOString();
    const goal: Goal = {
      id: randomUUID(),
      userId: res.locals.userId,
      ...result.value,
      createdAt: now,
      updatedAt: now,
    };
    db.goals.push(goal);
    saveDb(db);
    return res.status(201).json(toPublic(goal));
  });

  const updateGoal = (req: Request, res: Response) => {
    const goal = findOwnGoal(req, res);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const result = validateGoal(req.body, {
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      deadline: goal.deadline,
    });
    if ('error' in result) return res.status(400).json({ error: result.error });
    Object.assign(goal, result.value, { updatedAt: new Date().toISOString() });
    saveDb(db);
    return res.json(toPublic(goal));
  };
  app.put('/goals/:id', requireAuth, updateGoal);
  app.patch('/goals/:id', requireAuth, updateGoal);

  app.delete('/goals/:id', requireAuth, (req: Request, res: Response) => {
    const goal = findOwnGoal(req, res);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    db.goals.splice(db.goals.indexOf(goal), 1);
    saveDb(db);
    return res.status(204).end();
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// ---------- entry point ----------

if (process.argv.includes('--seed')) {
  seed();
  console.log('Seeded ' + DATA_FILE + ' and ' + CREDENTIALS_FILE);
  process.exit(0);
} else {
  const db = loadDb();
  createApp(db).listen(PORT, () => {
    console.log('Savings goals API listening on http://localhost:' + PORT);
  });
}
