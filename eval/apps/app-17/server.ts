import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type Status = 'todo' | 'in_progress' | 'done';
const STATUSES: Status[] = ['todo', 'in_progress', 'done'];

interface User {
  id: string;
  name: string;
  email: string;
  salt: string;
  passwordHash: string;
}

interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  dueDate: string | null;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

interface DB {
  users: User[];
  tasks: Task[];
}

const PORT = Number(process.env.PORT) || 3017;
const DATA_FILE = path.join(__dirname, 'data.json');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set; using a random secret (tokens become invalid on restart).');
}

// ---------- Password hashing ----------

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

const DUMMY_SALT = 'dummy-salt-for-timing';
const DUMMY_HASH = hashPassword('dummy-password', DUMMY_SALT);

// Always performs a hash so unknown emails take about as long as known ones.
function verifyPassword(password: string, user: User | undefined): boolean {
  const salt = user ? user.salt : DUMMY_SALT;
  const expected = Buffer.from(user ? user.passwordHash : DUMMY_HASH, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  const match = crypto.timingSafeEqual(actual, expected);
  return match && !!user;
}

// ---------- Seed data ----------

const SEED_USERS = [
  {
    name: 'Alice',
    email: 'alice@example.com',
    password: 'Alice-Pass-2024!',
    tasks: [
      {
        title: 'Plan quarterly budget review',
        description: 'Collect receipts, categorize spending, and compare against the targets set in January.',
        dueDate: '2025-04-15',
        status: 'in_progress' as Status,
      },
      {
        title: 'Book dentist appointment',
        description: 'Call the clinic for a routine cleaning; mornings before 10am work best.',
        dueDate: '2025-03-28',
        status: 'todo' as Status,
      },
    ],
  },
  {
    name: 'Bob',
    email: 'bob@example.com',
    password: 'Bob-Pass-2024!',
    tasks: [
      {
        title: 'Fix rear bike brakes',
        description: 'Replace worn brake pads and adjust cable tension before the weekend ride.',
        dueDate: '2025-03-22',
        status: 'todo' as Status,
      },
      {
        title: 'Draft conference talk outline',
        description: 'Outline a 20-minute talk on lessons learned from migrating to TypeScript; include three demos.',
        dueDate: '2025-05-02',
        status: 'done' as Status,
      },
    ],
  },
];

function buildSeed(): DB {
  const now = new Date().toISOString();
  const seeded: DB = { users: [], tasks: [] };
  for (const s of SEED_USERS) {
    const salt = crypto.randomBytes(16).toString('hex');
    const user: User = {
      id: crypto.randomUUID(),
      name: s.name,
      email: s.email,
      salt,
      passwordHash: hashPassword(s.password, salt),
    };
    seeded.users.push(user);
    for (const t of s.tasks) {
      seeded.tasks.push({
        id: crypto.randomUUID(),
        userId: user.id,
        title: t.title,
        description: t.description,
        dueDate: t.dueDate,
        status: t.status,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return seeded;
}

function saveDB(data: DB): void {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
}

const seedOnly = process.argv.includes('--seed');
const needsSeed = seedOnly || !fs.existsSync(DATA_FILE);
const db: DB = needsSeed ? buildSeed() : JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
if (needsSeed) saveDB(db);
if (seedOnly) {
  console.log('Seeded ' + db.users.length + ' users and ' + db.tasks.length + ' tasks into ' + DATA_FILE);
  process.exit(0);
}

// ---------- Validation helpers ----------

function isValidDate(s: unknown): boolean {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = Date.parse(s + 'T00:00:00Z');
  return !isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}

interface TaskInput {
  title?: string;
  description?: string;
  dueDate?: string | null;
  status?: Status;
}

function validateTask(body: any, partial: boolean): { error?: string; value?: TaskInput } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const value: TaskInput = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) {
      return { error: 'title must be a non-empty string of at most 200 characters' };
    }
    value.title = body.title.trim();
  } else if (!partial) {
    return { error: 'title is required' };
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 2000) {
      return { error: 'description must be a string of at most 2000 characters' };
    }
    value.description = body.description;
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate !== null && !isValidDate(body.dueDate)) {
      return { error: 'dueDate must be a valid YYYY-MM-DD date or null' };
    }
    value.dueDate = body.dueDate;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return { error: 'status must be one of: ' + STATUSES.join(', ') };
    }
    value.status = body.status;
  }
  return { value };
}

function publicTask(t: Task) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    dueDate: t.dueDate,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// ---------- App ----------

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
  const normalized = email.trim().toLowerCase();
  const user = db.users.find((u) => u.email.toLowerCase() === normalized);
  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

function requireAuth(req: any, res: any, next: any) {
  const header: string = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { sub?: string };
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.use('/tasks', requireAuth);

// Tasks are always scoped to the authenticated user; other users' tasks look like 404.
function findOwnTask(req: any): Task | undefined {
  return db.tasks.find((t) => t.id === req.params.id && t.userId === req.user.id);
}

app.get('/tasks', (req: any, res: any) => {
  const tasks = db.tasks.filter((t) => t.userId === req.user.id).map(publicTask);
  res.json({ tasks });
});

app.get('/tasks/:id', (req: any, res: any) => {
  const task = findOwnTask(req);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(publicTask(task));
});

app.post('/tasks', (req: any, res: any) => {
  const { error, value } = validateTask(req.body, false);
  if (error || !value) return res.status(400).json({ error });
  const now = new Date().toISOString();
  const task: Task = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    title: value.title as string,
    description: value.description ?? '',
    dueDate: value.dueDate ?? null,
    status: value.status ?? 'todo',
    createdAt: now,
    updatedAt: now,
  };
  db.tasks.push(task);
  saveDB(db);
  res.status(201).json(publicTask(task));
});

function updateTask(req: any, res: any) {
  const task = findOwnTask(req);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const { error, value } = validateTask(req.body, true);
  if (error || !value) return res.status(400).json({ error });
  if (Object.keys(value).length === 0) {
    return res.status(400).json({ error: 'Provide at least one of: title, description, dueDate, status' });
  }
  Object.assign(task, value);
  task.updatedAt = new Date().toISOString();
  saveDB(db);
  res.json(publicTask(task));
}

app.put('/tasks/:id', updateTask);
app.patch('/tasks/:id', updateTask);

app.delete('/tasks/:id', (req: any, res: any) => {
  const task = findOwnTask(req);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  db.tasks.splice(db.tasks.indexOf(task), 1);
  saveDB(db);
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
  console.log('Task board listening on http://localhost:' + PORT);
});
