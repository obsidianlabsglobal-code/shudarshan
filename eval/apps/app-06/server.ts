import express from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Note: tsx runs TypeScript without type-checking, so no @types packages are needed.

interface Booking {
  type: string;
  provider: string;
  reference: string;
  date?: string;
}

interface Trip {
  id: string;
  ownerId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  bookings: Booking[];
  itineraryNotes: string[];
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}

interface DB {
  users: User[];
  trips: Trip[];
}

const PORT = Number(process.env.PORT) || 3006;
// Set JWT_SECRET in real deployments. Without it, a random secret is used (tokens reset on restart).
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const DB_FILE = path.join(__dirname, "data.json");
const BOOKING_TYPES = ["flight", "hotel", "train", "car", "activity", "other"];

// ---------- password hashing (scrypt, built into Node) ----------

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return salt.toString("hex") + ":" + hash.toString("hex");
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Used so unknown emails cost the same time as wrong passwords.
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString("hex"));

// ---------- storage (JSON file) ----------

function buildSeed(): DB {
  const now = new Date().toISOString();
  const alice: User = {
    id: crypto.randomUUID(),
    name: "Alice",
    email: "alice@example.com",
    passwordHash: hashPassword("Alice-Pass-4821!"),
  };
  const bob: User = {
    id: crypto.randomUUID(),
    name: "Bob",
    email: "bob@example.com",
    passwordHash: hashPassword("Bob-Pass-7394!"),
  };
  const mk = (ownerId: string, fields: Omit<Trip, "id" | "ownerId" | "createdAt" | "updatedAt">): Trip => ({
    id: crypto.randomUUID(),
    ownerId,
    ...fields,
    createdAt: now,
    updatedAt: now,
  });

  const trips: Trip[] = [
    mk(alice.id, {
      title: "Lisbon Long Weekend",
      destination: "Lisbon, Portugal",
      startDate: "2025-05-09",
      endDate: "2025-05-12",
      bookings: [
        { type: "flight", provider: "TAP Air Portugal", reference: "TP1234", date: "2025-05-09" },
        { type: "hotel", provider: "Alfama Boutique Hotel", reference: "ALF-88213", date: "2025-05-09" },
      ],
      itineraryNotes: [
        "Day 1: Ride tram 28 and wander Alfama at sunset",
        "Day 2: Day trip to Sintra, Pena Palace first",
        "Day 3: Pastel de nata in Belem, then LX Factory",
      ],
    }),
    mk(alice.id, {
      title: "Kyoto Autumn Leaves",
      destination: "Kyoto, Japan",
      startDate: "2025-11-18",
      endDate: "2025-11-26",
      bookings: [
        { type: "flight", provider: "ANA", reference: "NH7Q2L", date: "2025-11-18" },
        { type: "hotel", provider: "Gion Machiya Stay", reference: "GMS-4471", date: "2025-11-19" },
        { type: "activity", provider: "Tea ceremony at Camellia", reference: "TC-902", date: "2025-11-21" },
      ],
      itineraryNotes: [
        "Buy an ICOCA card on arrival",
        "Visit Fushimi Inari at dawn to avoid crowds",
        "Book Eikando evening illumination tickets",
      ],
    }),
    mk(bob.id, {
      title: "Banff Road Trip",
      destination: "Banff, Canada",
      startDate: "2025-08-02",
      endDate: "2025-08-09",
      bookings: [
        { type: "car", provider: "Avis Calgary Airport", reference: "AV-55120", date: "2025-08-02" },
        { type: "hotel", provider: "Banff Mountain Lodge", reference: "BML-3098", date: "2025-08-02" },
      ],
      itineraryNotes: [
        "Sunrise at Moraine Lake (shuttle required)",
        "Hike Johnston Canyon on day 3",
        "Drive the Icefields Parkway to Jasper",
      ],
    }),
    mk(bob.id, {
      title: "Marrakech Market Week",
      destination: "Marrakech, Morocco",
      startDate: "2026-03-14",
      endDate: "2026-03-20",
      bookings: [
        { type: "flight", provider: "Royal Air Maroc", reference: "AT801K", date: "2026-03-14" },
        { type: "hotel", provider: "Riad Yasmine", reference: "RY-2210", date: "2026-03-14" },
        { type: "activity", provider: "Atlas Mountains guided day trek", reference: "ATL-77", date: "2026-03-17" },
      ],
      itineraryNotes: [
        "Haggle in the souks of the medina, start at 40% of asking price",
        "Hammam booked for the evening of day 2",
        "Cooking class in the Gueliz district",
      ],
    }),
  ];

  return { users: [alice, bob], trips };
}

function saveDB(data: DB): void {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function loadDB(): DB {
  if (!fs.existsSync(DB_FILE)) {
    const seeded = buildSeed();
    saveDB(seeded);
    return seeded;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as DB;
}

// ---------- validation ----------

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function validateTrip(body: any, partial: boolean): { errors: string[]; value: Record<string, any> } {
  const errors: string[] = [];
  const value: Record<string, any> = {};
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { errors: ["Body must be a JSON object"], value };
  }

  for (const field of ["title", "destination"]) {
    if (body[field] === undefined) {
      if (!partial) errors.push(field + " is required");
      continue;
    }
    const v = body[field];
    if (typeof v !== "string" || v.trim() === "" || v.length > 200) {
      errors.push(field + " must be a non-empty string up to 200 characters");
    } else {
      value[field] = v.trim();
    }
  }

  for (const field of ["startDate", "endDate"]) {
    if (body[field] === undefined) {
      if (!partial) errors.push(field + " is required");
      continue;
    }
    if (!isValidDate(body[field])) errors.push(field + " must be a valid date in YYYY-MM-DD format");
    else value[field] = body[field];
  }

  if (body.bookings !== undefined) {
    if (!Array.isArray(body.bookings) || body.bookings.length > 50) {
      errors.push("bookings must be an array of at most 50 items");
    } else {
      const cleaned: Booking[] = [];
      body.bookings.forEach((b: any, i: number) => {
        if (typeof b !== "object" || b === null || Array.isArray(b)) {
          errors.push("bookings[" + i + "] must be an object");
          return;
        }
        const okType = typeof b.type === "string" && BOOKING_TYPES.includes(b.type);
        const okProvider = typeof b.provider === "string" && b.provider.trim() !== "" && b.provider.length <= 200;
        const okRef = typeof b.reference === "string" && b.reference.trim() !== "" && b.reference.length <= 100;
        const okDate = b.date === undefined || isValidDate(b.date);
        if (!okType) errors.push("bookings[" + i + "].type must be one of: " + BOOKING_TYPES.join(", "));
        if (!okProvider) errors.push("bookings[" + i + "].provider is required (max 200 chars)");
        if (!okRef) errors.push("bookings[" + i + "].reference is required (max 100 chars)");
        if (!okDate) errors.push("bookings[" + i + "].date must be YYYY-MM-DD");
        if (okType && okProvider && okRef && okDate) {
          const item: Booking = { type: b.type, provider: b.provider.trim(), reference: b.reference.trim() };
          if (b.date !== undefined) item.date = b.date;
          cleaned.push(item);
        }
      });
      value.bookings = cleaned;
    }
  }

  if (body.itineraryNotes !== undefined) {
    const n = body.itineraryNotes;
    if (
      !Array.isArray(n) ||
      n.length > 200 ||
      !n.every((x: unknown) => typeof x === "string" && x.length <= 2000)
    ) {
      errors.push("itineraryNotes must be an array of at most 200 strings (max 2000 chars each)");
    } else {
      value.itineraryNotes = n;
    }
  }

  return { errors, value };
}

// ---------- app ----------

function createApp(db: DB) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req: any, res: any) => res.json({ status: "ok" }));

  app.post("/auth/login", (req: any, res: any) => {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "email and password are required" });
    }
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: "Invalid email or password" });
    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { algorithm: "HS256", expiresIn: "1h" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  });

  function requireAuth(req: any, res: any, next: any) {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) return res.status(401).json({ error: "Missing bearer token" });
    try {
      const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as any;
      const user = db.users.find((u) => u.id === payload.sub);
      if (!user) return res.status(401).json({ error: "Invalid token" });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  }

  app.use("/trips", requireAuth);

  // Other users' trips are reported as 404 so their existence is not revealed.
  const findOwned = (req: any) =>
    db.trips.find((t) => t.id === req.params.id && t.ownerId === req.user.id);

  const toPublic = (t: Trip) => {
    const { ownerId, ...rest } = t;
    return rest;
  };

  app.get("/trips", (req: any, res: any) => {
    const mine = db.trips.filter((t) => t.ownerId === req.user.id).map(toPublic);
    res.json(mine);
  });

  app.get("/trips/:id", (req: any, res: any) => {
    const trip = findOwned(req);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    res.json(toPublic(trip));
  });

  app.post("/trips", (req: any, res: any) => {
    const { errors, value } = validateTrip(req.body, false);
    if (!errors.length && value.endDate < value.startDate) errors.push("endDate must not be before startDate");
    if (errors.length) return res.status(400).json({ errors });
    const now = new Date().toISOString();
    const trip: Trip = {
      id: crypto.randomUUID(),
      ownerId: req.user.id,
      title: value.title,
      destination: value.destination,
      startDate: value.startDate,
      endDate: value.endDate,
      bookings: value.bookings || [],
      itineraryNotes: value.itineraryNotes || [],
      createdAt: now,
      updatedAt: now,
    };
    db.trips.push(trip);
    saveDB(db);
    res.status(201).json(toPublic(trip));
  });

  // PUT replaces the trip (required fields must be present); PATCH updates only the fields sent.
  const update = (partial: boolean) => (req: any, res: any) => {
    const trip = findOwned(req);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    const { errors, value } = validateTrip(req.body, partial);
    const merged = partial
      ? { ...trip, ...value }
      : { ...trip, bookings: [], itineraryNotes: [], ...value };
    if (!errors.length && merged.endDate < merged.startDate) errors.push("endDate must not be before startDate");
    if (errors.length) return res.status(400).json({ errors });
    merged.updatedAt = new Date().toISOString();
    Object.assign(trip, merged);
    saveDB(db);
    res.json(toPublic(trip));
  };
  app.put("/trips/:id", update(false));
  app.patch("/trips/:id", update(true));

  app.delete("/trips/:id", (req: any, res: any) => {
    const trip = findOwned(req);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    db.trips = db.trips.filter((t) => t.id !== trip.id);
    saveDB(db);
    res.status(204).end();
  });

  app.use((_req: any, res: any) => res.status(404).json({ error: "Not found" }));

  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body" });
    if (err && err.type === "entity.too.large") return res.status(413).json({ error: "Body too large" });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

// ---------- entry point ----------

if (process.argv.includes("--seed")) {
  saveDB(buildSeed());
  console.log("Seeded " + DB_FILE + " with users Alice and Bob (see sudarshan.json for credentials).");
} else {
  const db = loadDB();
  createApp(db).listen(PORT, () => {
    console.log("Trip planner listening on http://localhost:" + PORT);
  });
}
