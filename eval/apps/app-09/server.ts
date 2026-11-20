import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 3009;
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const DB_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.json');

interface Exercise { name: string; sets: number; reps: number }
interface Workout {
  id: number;
  userId: number;
  title: string;
  date: string;
  exercises: Exercise[];
  comments: string;
}
interface User { id: number; name: string; email: string; passwordHash: string }
interface DB { users: User[]; workouts: Workout[]; nextWorkoutId: number }
type WorkoutInput = Partial<Omit<Workout, 'id' | 'userId'>>;

// ---------- password hashing (scrypt) ----------
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

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

// ---------- storage ----------
function buildSeed(): DB {
  return {
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com', passwordHash: hashPassword('Alice-Lifts-2024!') },
      { id: 2, name: 'Bob', email: 'bob@example.com', passwordHash: hashPassword('Bob-Runs-2024!') },
    ],
    workouts: [
      {
        id: 1, userId: 1, title: 'Push day', date: '2024-05-06',
        exercises: [
          { name: 'Bench press', sets: 4, reps: 8 },
          { name: 'Overhead press', sets: 3, reps: 10 },
          { name: 'Tricep dips', sets: 3, reps: 12 },
        ],
        comments: 'Bench felt strong, add weight next week.',
      },
      {
        id: 2, userId: 1, title: 'Leg day', date: '2024-05-08',
        exercises: [
          { name: 'Back squat', sets: 5, reps: 5 },
          { name: 'Romanian deadlift', sets: 3, reps: 8 },
          { name: 'Walking lunges', sets: 3, reps: 12 },
        ],
        comments: 'Knees a bit sore on the last squat set.',
      },
      {
        id: 3, userId: 2, title: 'Full body circuit', date: '2024-05-07',
        exercises: [
          { name: 'Burpees', sets: 3, reps: 15 },
          { name: 'Kettlebell swings', sets: 4, reps: 20 },
          { name: 'Pull-ups', sets: 3, reps: 6 },
        ],
        comments: 'Short rests, heart rate stayed high.',
      },
      {
        id: 4, userId: 2, title: 'Back and biceps', date: '2024-05-09',
        exercises: [
          { name: 'Deadlift', sets: 3, reps: 5 },
          { name: 'Barbell row', sets: 4, reps: 8 },
          { name: 'Dumbbell curls', sets: 3, reps: 12 },
        ],
        comments: 'New personal best on deadlift.',
      },
    ],
    nextWorkoutId: 5,
  };
}

function save(data: DB): void {
  const tmp = DB_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, DB_FILE);
}

function load(): DB {
  if (!existsSync(DB_FILE)) {
    const seeded = buildSeed();
    save(seeded);
    return seeded;
  }
  return JSON.parse(readFileSync(DB_FILE, 'utf8')) as DB;
}

if (process.argv.includes('--seed')) {
  save(buildSeed());
  console.log('Database seeded at ' + DB_FILE + ' with users Alice and Bob.');
  process.exit(0);
}

const db = load();

// ---------- validation ----------
function isValidDate(s: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validate(body: unknown, partial: boolean): { error: string } | { value: WorkoutInput } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'A JSON object body is required' };
  }
  const b = body as Record<string, unknown>;
  const v: WorkoutInput = {};

  if (b.title !== undefined || !partial) {
    if (typeof b.title !== 'string' || b.title.trim().length < 1 || b.title.trim().length > 100) {
      return { error: 'title must be a string of 1 to 100 characters' };
    }
    v.title = b.title.trim();
  }

  if (b.date !== undefined) {
    if (typeof b.date !== 'string' || !isValidDate(b.date)) {
      return { error: 'date must be a valid YYYY-MM-DD string' };
    }
    v.date = b.date;
  } else if (!partial) {
    v.date = new Date().toISOString().slice(0, 10);
  }

  if (b.exercises !== undefined || !partial) {
    if (!Array.isArray(b.exercises) || b.exercises.length < 1 || b.exercises.length > 50) {
      return { error: 'exercises must be an array of 1 to 50 items' };
    }
    const list: Exercise[] = [];
    for (const item of b.exercises) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        return { error: 'each exercise must be an object' };
      }
      const e = item as Record<string, unknown>;
      if (typeof e.name !== 'string' || e.name.trim().length < 1 || e.name.trim().length > 100) {
        return { error: 'exercise name must be a string of 1 to 100 characters' };
      }
      if (typeof e.sets !== 'number' || !Number.isInteger(e.sets) || e.sets < 1 || e.sets > 100) {
        return { error: 'exercise sets must be an integer from 1 to 100' };
      }
      if (typeof e.reps !== 'number' || !Number.isInteger(e.reps) || e.reps < 1 || e.reps > 1000) {
        return { error: 'exercise reps must be an integer from 1 to 1000' };
      }
      list.push({ name: e.name.trim(), sets: e.sets, reps: e.reps });
    }
    v.exercises = list;
  }

  if (b.comments !== undefined) {
    if (typeof b.comments !== 'string' || b.comments.length > 1000) {
      return { error: 'comments must be a string of at most 1000 characters' };
    }
    v.comments = b.comments;
  } else if (!partial) {
    v.comments = '';
  }

  if (partial && Object.keys(v).length === 0) {
    return { error: 'Provide at least one of: title, date, exercises, comments' };
  }
  return { value: v };
}

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.post('/auth/login', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> | undefined;
  const email = body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body && typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }
  const user = db.users.find((u) => u.email.toLowerCase() === email);
  const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  const token = jwt.sign({}, JWT_SECRET, { algorithm: 'HS256', subject: String(user.id), expiresIn: '1h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }
  try {
    const payload = jwt.verify(match[1], JWT_SECRET, { algorithms: ['HS256'] });
    const sub = typeof payload === 'object' && payload ? payload.sub : undefined;
    const userId = Number(sub);
    if (!db.users.some((u) => u.id === userId)) throw new Error('unknown user');
    res.locals.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function parseId(raw: string): number | null {
  if (!/^[0-9]{1,9}$/.test(raw)) return null;
  return Number(raw);
}

function findOwned(id: number, userId: number): Workout | undefined {
  return db.workouts.find((w) => w.id === id && w.userId === userId);
}

app.use('/workouts', requireAuth);

app.get('/workouts', (_req: Request, res: Response) => {
  res.json(db.workouts.filter((w) => w.userId === res.locals.userId));
});

app.get('/workouts/:id', (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid id' }); return; }
  const workout = findOwned(id, res.locals.userId);
  if (!workout) { res.status(404).json({ error: 'Workout not found' }); return; }
  res.json(workout);
});

app.post('/workouts', (req: Request, res: Response) => {
  const result = validate(req.body, false);
  if ('error' in result) { res.status(400).json({ error: result.error }); return; }
  const v = result.value;
  const workout: Workout = {
    id: db.nextWorkoutId++,
    userId: res.locals.userId,
    title: v.title as string,
    date: v.date as string,
    exercises: v.exercises as Exercise[],
    comments: v.comments as string,
  };
  db.workouts.push(workout);
  save(db);
  res.status(201).location('/workouts/' + workout.id).json(workout);
});

function update(partial: boolean) {
  return (req: Request, res: Response): void => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: 'Invalid id' }); return; }
    const workout = findOwned(id, res.locals.userId);
    if (!workout) { res.status(404).json({ error: 'Workout not found' }); return; }
    const result = validate(req.body, partial);
    if ('error' in result) { res.status(400).json({ error: result.error }); return; }
    Object.assign(workout, result.value);
    save(db);
    res.json(workout);
  };
}

app.put('/workouts/:id', update(false));
app.patch('/workouts/:id', update(true));

app.delete('/workouts/:id', (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: 'Invalid id' }); return; }
  const index = db.workouts.findIndex((w) => w.id === id && w.userId === res.locals.userId);
  if (index === -1) { res.status(404).json({ error: 'Workout not found' }); return; }
  db.workouts.splice(index, 1);
  save(db);
  res.status(204).end();
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  if (err && err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('Workout log listening on port ' + PORT);
});
