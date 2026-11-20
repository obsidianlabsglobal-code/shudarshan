import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
}

interface Session {
  id: number;
  userId: number;
  instrument: string;
  date: string;
  durationMinutes: number;
  pieces: string[];
  notes: string;
}

interface Db {
  users: User[];
  sessions: Session[];
  nextSessionId: number;
}

const PORT = Number(process.env.PORT) || 3021;
const DATA_FILE = path.join(process.cwd(), 'data.json');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// ---------- password hashing (built-in scrypt) ----------

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ---------- seed data and persistence ----------

const SEED_USERS = [
  { name: 'Alice', email: 'alice@example.com', password: 'Alice-Scales-2024!' },
  { name: 'Bob', email: 'bob@example.com', password: 'Bob-Arpeggios-2024!' },
];

function buildSeedDb(): Db {
  const users: User[] = SEED_USERS.map((u, i) => ({
    id: i + 1,
    name: u.name,
    email: u.email,
    passwordHash: hashPassword(u.password),
  }));
  const sessions: Session[] = [
    {
      id: 1,
      userId: 1,
      instrument: 'Piano',
      date: '2024-05-06',
      durationMinutes: 45,
      pieces: ['Chopin - Nocturne Op. 9 No. 2', 'Bach - Invention No. 4'],
      notes: 'Left hand was uneven in the nocturne middle section. Slowed down to 60 bpm.',
    },
    {
      id: 2,
      userId: 1,
      instrument: 'Voice',
      date: '2024-05-08',
      durationMinutes: 30,
      pieces: ['Caro mio ben', 'Panis angelicus'],
      notes: 'Warm-up with lip trills. Focused on breath support for long phrases.',
    },
    {
      id: 3,
      userId: 2,
      instrument: 'Classical Guitar',
      date: '2024-05-07',
      durationMinutes: 60,
      pieces: ['Albeniz - Asturias', 'Tarrega - Lagrima'],
      notes: 'Tremolo section of Asturias still clipping. Practiced p-a-m-i with a metronome.',
    },
    {
      id: 4,
      userId: 2,
      instrument: 'Cello',
      date: '2024-05-09',
      durationMinutes: 40,
      pieces: ['Bach - Cello Suite No. 1 Prelude', 'Faure - Elegie'],
      notes: 'Worked on intonation in higher positions. Bow distribution in the prelude is improving.',
    },
  ];
  return { users, sessions, nextSessionId: 5 };
}

function saveDb(data: Db): void {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function loadDb(): Db {
  if (!fs.existsSync(DATA_FILE)) {
    const seeded = buildSeedDb();
    saveDb(seeded);
    return seeded;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Db;
}

// ---------- validation ----------

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validate(body: any, partial: boolean): { error?: string; value?: any } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const v: any = {};

  if (body.instrument !== undefined) {
    if (typeof body.instrument !== 'string' || !body.instrument.trim() || body.instrument.length > 100) {
      return { error: 'instrument must be a non-empty string up to 100 characters' };
    }
    v.instrument = body.instrument.trim();
  } else if (!partial) {
    return { error: 'instrument is required' };
  }

  if (body.date !== undefined) {
    if (typeof body.date !== 'string' || !isValidDate(body.date)) {
      return { error: 'date must be a valid date in YYYY-MM-DD format' };
    }
    v.date = body.date;
  } else if (!partial) {
    return { error: 'date is required' };
  }

  if (body.durationMinutes !== undefined) {
    if (!Number.isInteger(body.durationMinutes) || body.durationMinutes < 1 || body.durationMinutes > 1440) {
      return { error: 'durationMinutes must be an integer between 1 and 1440' };
    }
    v.durationMinutes = body.durationMinutes;
  } else if (!partial) {
    return { error: 'durationMinutes is required' };
  }

  if (body.pieces !== undefined) {
    if (
      !Array.isArray(body.pieces) ||
      body.pieces.length > 50 ||
      !body.pieces.every((p: unknown) => typeof p === 'string' && p.trim() !== '' && p.length <= 200)
    ) {
      return { error: 'pieces must be an array (max 50) of non-empty strings up to 200 characters' };
    }
    v.pieces = body.pieces.map((p: string) => p.trim());
  } else if (!partial) {
    return { error: 'pieces is required' };
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > 2000) {
      return { error: 'notes must be a string up to 2000 characters' };
    }
    v.notes = body.notes;
  } else if (!partial) {
    v.notes = '';
  }

  if (partial && Object.keys(v).length === 0) {
    return { error: 'Provide at least one field to update' };
  }
  return { value: v };
}

function publicSession(s: Session) {
  return {
    id: s.id,
    instrument: s.instrument,
    date: s.date,
    durationMinutes: s.durationMinutes,
    pieces: s.pieces,
    notes: s.notes,
  };
}

// ---------- app ----------

function main(): void {
  if (process.argv.includes('--seed')) {
    saveDb(buildSeedDb());
    console.log('Seeded ' + DATA_FILE + ' with users: ' + SEED_USERS.map((u) => u.email).join(', '));
    return;
  }

  if (!process.env.JWT_SECRET) {
    console.warn('JWT_SECRET is not set; using a random secret. Tokens become invalid after restart.');
  }

  const db = loadDb();
  const dummyHash = hashPassword('dummy-password');
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  function requireAuth(req: any, res: any, next: any) {
    const header: string = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }
    try {
      const payload: any = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      const userId = Number(payload.sub);
      if (!db.users.some((u) => u.id === userId)) throw new Error('unknown user');
      req.userId = userId;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // Returns the session if it exists AND belongs to the caller; otherwise sends an error.
  function findOwned(req: any, res: any): Session | null {
    if (!/^\d+$/.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid session id' });
      return null;
    }
    const id = Number(req.params.id);
    const session = db.sessions.find((s) => s.id === id && s.userId === req.userId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return null;
    }
    return session;
  }

  app.post('/auth/login', (req: any, res: any) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    const ok = verifyPassword(password, user ? user.passwordHash : dummyHash);
    if (!user || !ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ email: user.email }, JWT_SECRET, {
      algorithm: 'HS256',
      subject: String(user.id),
      expiresIn: '1h',
    });
    return res.json({ token });
  });

  app.get('/sessions', requireAuth, (req: any, res: any) => {
    const mine = db.sessions.filter((s) => s.userId === req.userId).map(publicSession);
    res.json(mine);
  });

  app.get('/sessions/:id', requireAuth, (req: any, res: any) => {
    const session = findOwned(req, res);
    if (session) res.json(publicSession(session));
  });

  app.post('/sessions', requireAuth, (req: any, res: any) => {
    const { error, value } = validate(req.body, false);
    if (error) return res.status(400).json({ error });
    const session: Session = { id: db.nextSessionId++, userId: req.userId, ...value };
    db.sessions.push(session);
    saveDb(db);
    return res.status(201).json(publicSession(session));
  });

  function update(partial: boolean) {
    return (req: any, res: any) => {
      const session = findOwned(req, res);
      if (!session) return;
      const { error, value } = validate(req.body, partial);
      if (error) return res.status(400).json({ error });
      Object.assign(session, value);
      saveDb(db);
      res.json(publicSession(session));
    };
  }

  app.put('/sessions/:id', requireAuth, update(false));
  app.patch('/sessions/:id', requireAuth, update(true));

  app.delete('/sessions/:id', requireAuth, (req: any, res: any) => {
    const session = findOwned(req, res);
    if (!session) return;
    db.sessions.splice(db.sessions.indexOf(session), 1);
    saveDb(db);
    res.status(204).end();
  });

  app.use((_req: any, res: any) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Body too large' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, () => {
    console.log('Music practice log listening on http://localhost:' + PORT);
  });
}

main();
