// Rewrite-generation harness. From ONE base BOLA app (victim/app-50, ownership
// intact) we programmatically emit many rewrites — we do NOT hand-author them.
// Each rewrite applies exactly one rewrite TYPE and seeds a labeled ownership-
// drop regression (except the secure controls). Synthetic apps, our own, run on
// localhost only; all data is synthetic.
//
// Read-only w.r.t. engine/ and victim/: this module imports nothing from engine
// and only mirrors the base app's shape. Generated apps live under
// eval/benchmark/apps/ and are disposable (git-ignored); the generator is the
// source of truth.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export type RewriteType = "A" | "B" | "C" | "D" | "SECURE";
export type Expected = "VULNERABLE" | "INCONCLUSIVE" | "NO_LEAK_DETECTED";

export interface Spec {
  dir: string; // basename, must contain a unique number -> port 3000+n
  type: RewriteType;
  label: string; // human description of the rewrite
  listPath: string; // where the collection now lives
  getById: "path" | "query"; // listPath/:id  vs  listPath?id=
  listShape: "standard" | "deepNested"; // {items:[...]} vs {result:{rows:[...]}}
  ownership: boolean; // true = ownership check intact (secure control)
  expected: Expected;
}

// The base app's synthetic data — identical to victim/app-50, reproduced here so
// the generator is self-contained (we do not import or mutate victim/).
const USERS = [
  { id: "u-anita", name: "Anita Deshpande", email: "anita@clinic.test", password: "anita-demo-2026" },
  { id: "u-rohan", name: "Rohan Mehta", email: "rohan@clinic.test", password: "rohan-demo-2026" },
];
const RECORDS = [
  { id: "rec-1001", ownerId: "u-anita", patient: "Anita Deshpande", phone: "9845012376", accountNo: "IN48210077410", reason: "Follow-up on thyroid medication", amount: 2450 },
  { id: "rec-1002", ownerId: "u-anita", patient: "Anita Deshpande", phone: "9845012376", accountNo: "IN48210099120", reason: "Routine blood panel", amount: 1200 },
  { id: "rec-2001", ownerId: "u-rohan", patient: "Rohan Mehta", phone: "9820114567", accountNo: "IN77311477410", reason: "Sports injury assessment, left knee", amount: 3800 },
  { id: "rec-2002", ownerId: "u-rohan", patient: "Rohan Mehta", phone: "9820114567", accountNo: "IN77311500230", reason: "Annual health check-up", amount: 1500 },
];

function portOf(dir: string): number {
  const m = dir.match(/(\d+)/);
  return 3000 + (m ? Number(m[1]) : 0);
}

// Build the list handler body for the chosen envelope shape.
function listHandler(spec: Spec): string {
  const mine = "records.filter((r) => r.ownerId === req.uid)";
  if (spec.listShape === "deepNested") {
    // Doubly-nested envelope: the array is not a top-level property, so a scanner
    // that looks for the first top-level array-of-objects will not find it.
    return `res.json({ result: { rows: ${mine} }, meta: { count: ${mine}.length } })`;
  }
  // Standard: first top-level property is the array of objects.
  return `res.json({ items: ${mine} })`;
}

// Build the get-by-id route(s). For "query" style there is NO path-param route —
// the record is fetched via ?id= on the collection path.
function getByIdRoutes(spec: Spec): string {
  const ownCheck = spec.ownership
    ? "const r = records.find((x) => x.id === req.params.id && x.ownerId === req.uid);"
    : "const r = records.find((x) => x.id === req.params.id); // OWNERSHIP DROP — seeded regression";
  if (spec.getById === "path") {
    return `app.get(${JSON.stringify(spec.listPath + "/:id")}, auth, (req, res) => {
  ${ownCheck}
  if (!r) return res.status(404).json({ error: "not found" });
  res.json(r);
});`;
  }
  // query style: GET listPath?id=... returns one record (no path-param route at all)
  const qOwn = spec.ownership
    ? "const r = records.find((x) => x.id === req.query.id && x.ownerId === req.uid);"
    : "const r = records.find((x) => x.id === req.query.id); // OWNERSHIP DROP — seeded regression";
  return `app.get(${JSON.stringify(spec.listPath)}, auth, (req, res) => {
  if (req.query.id !== undefined) {
    ${qOwn}
    if (!r) return res.status(404).json({ error: "not found" });
    return res.json(r);
  }
  ${listHandler(spec)};
});`;
}

export function buildServer(spec: Spec): string {
  const port = portOf(spec.dir);
  const regressionNote = spec.ownership
    ? "// SECURE CONTROL — ownership enforced, no regression. Our own app, localhost, synthetic."
    : `// INDUCED REGRESSION (seeded, labeled) — type ${spec.type}: ${spec.label}.`;
  // For query-style, the collection+get-by-id share one route (emitted in getByIdRoutes).
  const listRoute =
    spec.getById === "query"
      ? ""
      : `app.get(${JSON.stringify(spec.listPath)}, auth, (req, res) => ${listHandler(spec)});\n`;
  return `${regressionNote}
// Synthetic clinic-records app, our own, localhost only. Rewritten from the base
// safe app by the eval rewrite generator. Type=${spec.type}. Expected verdict=${spec.expected}.
import express from "express";
import jwt from "jsonwebtoken";

const PORT = Number(process.env.PORT) || ${port};
const SECRET = "demo-clinic-secret";

const users = ${JSON.stringify(USERS, null, 2)};
const records = ${JSON.stringify(RECORDS, null, 2)};

if (process.argv.includes("--seed")) {
  console.log("bench app ${spec.dir} seeded (in-memory, " + records.length + " records)");
  process.exit(0);
}

const app = express();
app.use(express.json());

function auth(req, res, next) {
  const t = (req.headers.authorization || "").split(" ")[1];
  if (!t) return res.status(401).json({ error: "missing token" });
  try {
    req.uid = (jwt.verify(t, SECRET)).sub;
    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}

app.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const u = users.find((x) => x.email === email && x.password === password);
  if (!u) return res.status(401).json({ error: "invalid credentials" });
  res.json({ token: jwt.sign({ sub: u.id }, SECRET, { expiresIn: "2h" }), user: { id: u.id, name: u.name } });
});

${listRoute}${getByIdRoutes(spec)}

app.use((_req, res) => res.status(404).json({ error: "not found" }));
app.listen(PORT, () => console.log("bench ${spec.dir} (type ${spec.type}) on " + PORT));
`;
}

const SUDARSHAN_JSON = JSON.stringify(
  {
    users: [
      { name: "Anita", email: "anita@clinic.test", password: "anita-demo-2026" },
      { name: "Rohan", email: "rohan@clinic.test", password: "rohan-demo-2026" },
    ],
  },
  null,
  2,
);

export function writeApp(appsRoot: string, spec: Spec): string {
  const dir = join(appsRoot, spec.dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "server.ts"), buildServer(spec));
  writeFileSync(join(dir, "sudarshan.json"), SUDARSHAN_JSON + "\n");
  return dir;
}

// ---- The spec matrix: one rewrite type per app, 20+ apps across the types. ----
export function specMatrix(): Spec[] {
  const specs: Spec[] = [];
  let n = 100; // -> ports 3100+
  const next = () => `bench-${n++}`;

  // Type A — in-dictionary resource + known prefix, path-param id, standard list.
  // Expected VULNERABLE: self-relocating re-finds the moved route and re-proves.
  const aRoutes = [
    "/api/v2/items", "/api/v1/records", "/api/notes", "/v2/tasks", "/api/v2/logs",
    "/entries", "/api/v1/bills", "/api/v2/contacts",
  ];
  for (const r of aRoutes) {
    specs.push({ dir: next(), type: "A", label: `in-dict resource + known prefix → ${r}`, listPath: r, getById: "path", listShape: "standard", ownership: false, expected: "VULNERABLE" });
  }

  // Type B — unfamiliar resource name (absent from the resource dictionary).
  // Expected INCONCLUSIVE: honest "cannot locate", never false-safe.
  const bRoutes = ["/api/v2/clinical-files", "/api/manifests", "/dossiers", "/api/v1/charts", "/api/v2/encounters"];
  for (const r of bRoutes) {
    specs.push({ dir: next(), type: "B", label: `unfamiliar resource name → ${r}`, listPath: r, getById: "path", listShape: "standard", ownership: false, expected: "INCONCLUSIVE" });
  }

  // Type C — nested route beyond the prefix dictionary. Tests re-discovery reach.
  const cRoutes = ["/api/v2/clinic/items", "/api/v1/org/records", "/api/portal/notes", "/v2/tenant/tasks"];
  for (const r of cRoutes) {
    specs.push({ dir: next(), type: "C", label: `nested route → ${r}`, listPath: r, getById: "path", listShape: "standard", ownership: false, expected: "INCONCLUSIVE" });
  }

  // Type D — alternate structure. Two sub-shapes: id-as-query-param, and a deeply
  // nested list envelope. Tests the listPath/{id} + top-level-array assumptions.
  specs.push({ dir: next(), type: "D", label: "id as query param on /api/v2/items", listPath: "/api/v2/items", getById: "query", listShape: "standard", ownership: false, expected: "INCONCLUSIVE" });
  specs.push({ dir: next(), type: "D", label: "id as query param on /api/records", listPath: "/api/records", getById: "query", listShape: "standard", ownership: false, expected: "INCONCLUSIVE" });
  specs.push({ dir: next(), type: "D", label: "deeply-nested list envelope on /api/v2/items", listPath: "/api/v2/items", getById: "path", listShape: "deepNested", ownership: false, expected: "INCONCLUSIVE" });
  specs.push({ dir: next(), type: "D", label: "deeply-nested list envelope on /api/v1/records", listPath: "/api/v1/records", getById: "path", listShape: "deepNested", ownership: false, expected: "INCONCLUSIVE" });

  // Secure controls — ownership intact, discoverable route. Expected NO_LEAK_DETECTED.
  const secRoutes = ["/api/v2/items", "/api/v1/records", "/api/notes", "/tasks"];
  for (const r of secRoutes) {
    specs.push({ dir: next(), type: "SECURE", label: `ownership intact → ${r}`, listPath: r, getById: "path", listShape: "standard", ownership: true, expected: "NO_LEAK_DETECTED" });
  }

  return specs;
}

export function regenerate(appsRoot: string): Spec[] {
  rmSync(appsRoot, { recursive: true, force: true });
  mkdirSync(appsRoot, { recursive: true });
  const specs = specMatrix();
  for (const s of specs) writeApp(appsRoot, s);
  return specs;
}
