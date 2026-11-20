// INDUCED REGRESSION — synthetic, our own app, localhost only.
// An AI refactor "modernised" the SAFE app-50: it moved the records resource
// from /records to /api/v2/items, rewrote the handler — and DROPPED the
// ownership check on get-by-id. The old route is gone (404); the new route
// leaks any user's record cross-identity. Same seeded data as app-50.
import express from "express";
import jwt from "jsonwebtoken";

const PORT = Number(process.env.PORT) || 3051;
const SECRET = "demo-clinic-secret";

const users = [
  { id: "u-anita", name: "Anita Deshpande", email: "anita@clinic.test", password: "anita-demo-2026" },
  { id: "u-rohan", name: "Rohan Mehta", email: "rohan@clinic.test", password: "rohan-demo-2026" },
];

const records = [
  { id: "rec-1001", ownerId: "u-anita", patient: "Anita Deshpande", phone: "9845012376", accountNo: "IN48210077410", reason: "Follow-up on thyroid medication", amount: 2450 },
  { id: "rec-1002", ownerId: "u-anita", patient: "Anita Deshpande", phone: "9845012376", accountNo: "IN48210099120", reason: "Routine blood panel", amount: 1200 },
  { id: "rec-2001", ownerId: "u-rohan", patient: "Rohan Mehta", phone: "9820114567", accountNo: "IN77311477410", reason: "Sports injury assessment, left knee", amount: 3800 },
  { id: "rec-2002", ownerId: "u-rohan", patient: "Rohan Mehta", phone: "9820114567", accountNo: "IN77311500230", reason: "Annual health check-up", amount: 1500 },
];

if (process.argv.includes("--seed")) {
  console.log("demo app-51 seeded (in-memory, " + records.length + " records)");
  process.exit(0);
}

const app = express();
app.use(express.json());

function auth(req: any, res: any, next: any) {
  const t = (req.headers.authorization || "").split(" ")[1];
  if (!t) return res.status(401).json({ error: "missing token" });
  try {
    req.uid = (jwt.verify(t, SECRET) as any).sub;
    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}

app.post("/auth/login", (req: any, res: any) => {
  const { email, password } = req.body || {};
  const u = users.find((x) => x.email === email && x.password === password);
  if (!u) return res.status(401).json({ error: "invalid credentials" });
  res.json({ token: jwt.sign({ sub: u.id }, SECRET, { expiresIn: "2h" }), user: { id: u.id, name: u.name } });
});

// The list still scopes to the signed-in user (so the move looks harmless)...
app.get("/api/v2/items", auth, (req: any, res: any) => res.json({ items: records.filter((r) => r.ownerId === req.uid) }));

// ...but get-by-id no longer checks ownership. INDUCED REGRESSION: cross-user leak.
app.get("/api/v2/items/:id", auth, (req: any, res: any) => {
  const r = records.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  res.json(r);
});

app.use((_req: any, res: any) => res.status(404).json({ error: "not found" }));
app.listen(PORT, () => console.log("demo clinic records (REWRITTEN) on " + PORT));
