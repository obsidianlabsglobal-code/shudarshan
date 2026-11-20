import express from "express";
import jwt from "jsonwebtoken";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------- Config ----------
const PORT = Number(process.env.PORT) || 3025;
// If JWT_SECRET is not set, a random secret is used (tokens become invalid on restart).
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString("hex");
const DATA_FILE =
  process.env.DATA_FILE ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), "data.json");

// ---------- Types ----------
interface User {
  id: string;
  name: string;
  email: string;
  salt: string;
  hash: string;
}

interface GiftFields {
  recipient: string;
  occasion: string;
  budget: number;
  store: string;
  notes: string;
}

interface Gift extends GiftFields {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface Db {
  users: User[];
  gifts: Gift[];
}

// ---------- Password hashing ----------
function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function makeUser(name: string, email: string, password: string): User {
  const salt = randomBytes(16).toString("hex");
  return { id: randomUUID(), name, email, salt, hash: hashPassword(password, salt) };
}

const DUMMY_SALT = randomBytes(16).toString("hex");

// ---------- Seed data ----------
function buildSeed(): Db {
  const alice = makeUser("Alice", "alice@example.com", "AlicePass123!");
  const bob = makeUser("Bob", "bob@example.com", "BobPass456!");
  const now = new Date().toISOString();

  const gift = (userId: string, f: GiftFields): Gift => ({
    id: randomUUID(),
    userId,
    ...f,
    createdAt: now,
    updatedAt: now,
  });

  return {
    users: [alice, bob],
    gifts: [
      gift(alice.id, {
        recipient: "Mom",
        occasion: "Birthday",
        budget: 60,
        store: "Silk & Thread Boutique",
        notes: "Loves lavender. A merino wool scarf in soft purple would be perfect.",
      }),
      gift(alice.id, {
        recipient: "Cousin Priya",
        occasion: "Wedding",
        budget: 120,
        store: "Crate & Barrel",
        notes: "Check the registry first; otherwise a set of stoneware dinner plates.",
      }),
      gift(bob.id, {
        recipient: "Sister Dana",
        occasion: "Graduation",
        budget: 85,
        store: "Bookshop.org",
        notes: "Nursing grad. Get a quality stethoscope engraving kit and a card.",
      }),
      gift(bob.id, {
        recipient: "Friend Marcus",
        occasion: "Housewarming",
        budget: 40,
        store: "Local plant nursery",
        notes: "Low-light plants only, e.g. a snake plant with a ceramic pot.",
      }),
    ],
  };
}

// ---------- Storage (JSON file) ----------
function writeDb(data: Db): void {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function loadDb(): Db {
  if (!fs.existsSync(DATA_FILE)) {
    const seeded = buildSeed();
    writeDb(seeded);
    return seeded;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Db;
}

if (process.argv.includes("--seed")) {
  writeDb(buildSeed());
  console.log("Seeded users (alice@example.com, bob@example.com) and gifts into " + DATA_FILE);
  process.exit(0);
}

const db = loadDb();

// ---------- Validation ----------
function parseGift(
  body: any,
  partial: boolean
): { value?: Partial<GiftFields>; error?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object" };
  }

  const out: Partial<GiftFields> = {};
  const textFields: Array<[keyof GiftFields, number, boolean]> = [
    ["recipient", 200, true],
    ["occasion", 200, true],
    ["store", 200, false],
    ["notes", 2000, false],
  ];

  for (const [key, max, required] of textFields) {
    const v = body[key];
    if (v === undefined) {
      if (!partial && required) return { error: key + " is required" };
      if (!partial && !required) (out as any)[key] = "";
      continue;
    }
    if (typeof v !== "string") return { error: key + " must be a string" };
    const trimmed = v.trim();
    if (required && trimmed.length === 0) return { error: key + " must not be empty" };
    if (trimmed.length > max) return { error: key + " must be at most " + max + " characters" };
    (out as any)[key] = trimmed;
  }

  if (body.budget === undefined) {
    if (!partial) return { error: "budget is required" };
  } else {
    if (typeof body.budget !== "number" || !Number.isFinite(body.budget) || body.budget < 0) {
      return { error: "budget must be a non-negative number" };
    }
    out.budget = body.budget;
  }

  if (partial && Object.keys(out).length === 0) {
    return { error: "Provide at least one field to update" };
  }
  return { value: out };
}

// ---------- App ----------
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

function requireAuth(req: any, res: any, next: any) {
  const header = String(req.headers["authorization"] || "");
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as any;
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: "Invalid token" });
    req.userId = user.id;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.get("/health", (_req: any, res: any) => {
  res.json({ status: "ok" });
});

app.post("/auth/login", (req: any, res: any) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());
  const salt = user ? user.salt : DUMMY_SALT;
  const candidate = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(user ? user.hash : hashPassword("dummy", DUMMY_SALT), "hex");
  const ok = timingSafeEqual(candidate, expected) && !!user;
  if (!ok || !user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
  res.json({ token });
});

// Gift routes (all scoped to the authenticated user)
app.get("/gifts", requireAuth, (req: any, res: any) => {
  res.json(db.gifts.filter((g) => g.userId === req.userId).map(publicGift));
});

app.get("/gifts/:id", requireAuth, (req: any, res: any) => {
  const gift = findOwnGift(req);
  if (!gift) return res.status(404).json({ error: "Gift idea not found" });
  res.json(publicGift(gift));
});

app.post("/gifts", requireAuth, (req: any, res: any) => {
  const { value, error } = parseGift(req.body, false);
  if (error || !value) return res.status(400).json({ error });
  const now = new Date().toISOString();
  const gift: Gift = {
    id: randomUUID(),
    userId: req.userId,
    ...(value as GiftFields),
    createdAt: now,
    updatedAt: now,
  };
  db.gifts.push(gift);
  writeDb(db);
  res.status(201).json(publicGift(gift));
});

function updateGift(req: any, res: any) {
  const gift = findOwnGift(req);
  if (!gift) return res.status(404).json({ error: "Gift idea not found" });
  const { value, error } = parseGift(req.body, true);
  if (error || !value) return res.status(400).json({ error });
  Object.assign(gift, value, { updatedAt: new Date().toISOString() });
  writeDb(db);
  res.json(publicGift(gift));
}
app.put("/gifts/:id", requireAuth, updateGift);
app.patch("/gifts/:id", requireAuth, updateGift);

app.delete("/gifts/:id", requireAuth, (req: any, res: any) => {
  const gift = findOwnGift(req);
  if (!gift) return res.status(404).json({ error: "Gift idea not found" });
  db.gifts = db.gifts.filter((g) => g.id !== gift.id);
  writeDb(db);
  res.status(204).end();
});

function findOwnGift(req: any): Gift | undefined {
  return db.gifts.find((g) => g.id === req.params.id && g.userId === req.userId);
}

function publicGift(g: Gift) {
  const { userId, ...rest } = g;
  return rest;
}

app.use((_req: any, res: any) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log("Gift planner listening on port " + PORT);
});
