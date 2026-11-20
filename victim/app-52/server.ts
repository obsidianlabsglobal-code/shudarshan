// INDUCED REGRESSION — synthetic, our own app, localhost only.
// A second AI refactor renamed the records resource to an UNFAMILIAR noun that
// is NOT in the scanner's resource dictionary: /api/v2/manifests. Ownership is
// dropped here too, so a leak *exists* — but dictionary-based discovery cannot
// locate the endpoint. Correct behaviour is INCONCLUSIVE (exit 2), NEVER a
// false SECURE. Login still works; only the collection name is unknown.
import express from "express";
import jwt from "jsonwebtoken";

const PORT = Number(process.env.PORT) || 3052;
const SECRET = "demo-clinic-secret";

const users = [
  { id: "u-anita", name: "Anita Deshpande", email: "anita@clinic.test", password: "anita-demo-2026" },
  { id: "u-rohan", name: "Rohan Mehta", email: "rohan@clinic.test", password: "rohan-demo-2026" },
];

const records = [
  { id: "rec-1001", ownerId: "u-anita", patient: "Anita Deshpande", phone: "9845012376", accountNo: "IN48210077410", reason: "Follow-up on thyroid medication", amount: 2450 },
  { id: "rec-2001", ownerId: "u-rohan", patient: "Rohan Mehta", phone: "9820114567", accountNo: "IN77311477410", reason: "Sports injury assessment, left knee", amount: 3800 },
];

if (process.argv.includes("--seed")) {
  console.log("demo app-52 seeded (in-memory, " + records.length + " records)");
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

// Resource renamed to an unfamiliar noun ("manifests") absent from RESOURCE_DICT.
app.get("/api/v2/manifests", auth, (req: any, res: any) => res.json({ manifests: records.filter((r) => r.ownerId === req.uid) }));

// Ownership dropped here too — a real leak — but the scanner can't find this path.
app.get("/api/v2/manifests/:id", auth, (req: any, res: any) => {
  const r = records.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  res.json(r);
});

app.use((_req: any, res: any) => res.status(404).json({ error: "not found" }));
app.listen(PORT, () => console.log("demo clinic records (RENAMED → unknown) on " + PORT));
