import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data.json');
const CREDENTIALS_FILE = path.join(__dirname, 'sudarshan.json');
const PORT = Number(process.env.PORT) || 3001;

// Set JWT_SECRET in real deployments. Without it, a random secret is generated
// per process, so tokens stop working after a restart.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const STATUSES = ['want-to-read', 'reading', 'finished'];

// Loose request/response types: only express, jsonwebtoken and tsx are dependencies.
type Req = any;
type Res = any;
type Next = any;

interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
}

interface Book {
  id: number;
  userId: number;
  title: string;
  writer: string;
  notes: string;
  status: string;
}

interface Db {
  users: User[];
  books: Book[];
  nextBookId: number;
}

// ---------- password hashing (built-in scrypt) ----------

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));

// ---------- seed data ----------

const SEED_USERS = [
  { id: 1, name: 'Alice', email: 'alice@example.com', password: 'Alice-Reads-2024!' },
  { id: 2, name: 'Bob', email: 'bob@example.org', password: 'Bob-Pages-2024!' },
];

function buildSeedDb(): Db {
  const users: User[] = SEED_USERS.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    passwordHash: hashPassword(u.password),
  }));
  const books: Book[] = [
    {
      id: 1,
      userId: 1,
      title: 'The Left Hand of Darkness',
      writer: 'Ursula K. Le Guin',
      notes: 'Fascinating take on gender and politics. Halfway through the trek across the ice.',
      status: 'reading',
    },
    {
      id: 2,
      userId: 1,
      title: 'Braiding Sweetgrass',
      writer: 'Robin Wall Kimmerer',
      notes: 'Recommended by a friend. Save for the summer holidays.',
      status: 'want-to-read',
    },
    {
      id: 3,
      userId: 2,
      title: 'Dune',
      writer: 'Frank Herbert',
      notes: 'Re-read for book club. The ecology chapters hold up really well.',
      status: 'finished',
    },
    {
      id: 4,
      userId: 2,
      title: 'The Pragmatic Programmer',
      writer: 'Andrew Hunt and David Thomas',
      notes: 'Reading one tip per day and trying it at work.',
      status: 'reading',
    },
  ];
  return { users, books, nextBookId: 5 };
}

function writeFileAtomic(file: string, content: string): void {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function seed(): Db {
  const fresh = buildSeedDb();
  writeFileAtomic(DATA_FILE, JSON.stringify(fresh, null, 2));
  const creds = {
    users: SEED_USERS.map((u) => ({ name: u.name, email: u.email, password: u.password })),
  };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2) + '\n');
  return fresh;
}

function loadDb(): Db {
  if (!fs.existsSync(DATA_FILE)) {
    return seed();
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Db;
}

// ---------- CLI: seed command ----------

if (process.argv.includes('--seed')) {
  seed();
  console.log('Seeded ' + DATA_FILE + ' and ' + CREDENTIALS_FILE);
  process.exit(0);
}

const db: Db = loadDb();

function save(): void {
  writeFileAtomic(DATA_FILE, JSON.stringify(db, null, 2));
}

// ---------- validation ----------

function validateBook(body: any, partial: boolean): { value?: any; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const out: any = {};

  for (const field of ['title', 'writer']) {
    const raw = body[field];
    if (raw === undefined) {
      if (!partial) return { error: field + ' is required' };
      continue;
    }
    if (typeof raw !== 'string' || raw.trim().length === 0 || raw.trim().length > 200) {
      return { error: field + ' must be a non-empty string of at most 200 characters' };
    }
    out[field] = raw.trim();
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > 2000) {
      return { error: 'notes must be a string of at most 2000 characters' };
    }
    out.notes = body.notes;
  } else if (!partial) {
    out.notes = '';
  }

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUSES.includes(body.status)) {
      return { error: 'status must be one of: ' + STATUSES.join(', ') };
    }
    out.status = body.status;
  } else if (!partial) {
    out.status = 'want-to-read';
  }

  if (partial && Object.keys(out).length === 0) {
    return { error: 'Provide at least one of: title, writer, notes, status' };
  }
  return { value: out };
}

function parseId(param: string): number | null {
  const n = Number(param);
  if (!Number.isSafeInteger(n) || n < 1 || String(n) !== param) return null;
  return n;
}

function publicBook(b: Book) {
  return { id: b.id, title: b.title, writer: b.writer, notes: b.notes, status: b.status };
}

// ---------- app ----------

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

function requireAuth(req: Req, res: Res, next: Next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const payload: any = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const user = db.users.find((u) => u.id === Number(payload.sub));
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.get('/health', (_req: Req, res: Res) => {
  res.json({ status: 'ok' });
});

app.post('/auth/login', (req: Req, res: Res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || password.length > 200) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  // Always run a hash comparison so timing does not reveal whether the email exists.
  const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ sub: String(user.id) }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// List the current user's books (IDs included).
// Optional ?q=term keeps only books whose title, writer or notes contain the term (case-insensitive).
app.get('/books', requireAuth, (req: Req, res: Res) => {
  let books = db.books.filter((b) => b.userId === req.user.id);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  if (q) {
    books = books.filter((b) =>
      [b.title, b.writer, b.notes].some((field) => field.toLowerCase().includes(q)),
    );
  }
  res.json({ books: books.map(publicBook) });
});

// Create
app.post('/books', requireAuth, (req: Req, res: Res) => {
  const { value, error } = validateBook(req.body, false);
  if (error) return res.status(400).json({ error });
  const book: Book = { id: db.nextBookId++, userId: req.user.id, ...value };
  db.books.push(book);
  save();
  res.status(201).json(publicBook(book));
});

// Get one (404 if it does not exist or belongs to someone else)
app.get('/books/:id', requireAuth, (req: Req, res: Res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const book = db.books.find((b) => b.id === id && b.userId === req.user.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.json(publicBook(book));
});

// Update (only the supplied fields change)
function updateBook(req: Req, res: Res) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const book = db.books.find((b) => b.id === id && b.userId === req.user.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  const { value, error } = validateBook(req.body, true);
  if (error) return res.status(400).json({ error });
  Object.assign(book, value);
  save();
  res.json(publicBook(book));
}
app.put('/books/:id', requireAuth, updateBook);
app.patch('/books/:id', requireAuth, updateBook);

// Delete
app.delete('/books/:id', requireAuth, (req: Req, res: Res) => {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const index = db.books.findIndex((b) => b.id === id && b.userId === req.user.id);
  if (index === -1) return res.status(404).json({ error: 'Book not found' });
  db.books.splice(index, 1);
  save();
  res.status(204).end();
});

app.use((_req: Req, res: Res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: Req, res: Res, _next: Next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('Reading list API listening on port ' + PORT);
});
