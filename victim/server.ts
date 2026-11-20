// MediTrack — Dr. Sharma's Clinic appointment tracker.
// A deliberately vulnerable demo target WE OWN, served on localhost only.
// Three intentional flaws are marked "FLAW" below.

import { readFileSync, existsSync } from "node:fs";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { CANONICAL, STATE_PATH, writeState, type State } from "./seed";

// FLAW 3: JWT secret hardcoded in source (a real app would use an env var).
const JWT_SECRET = "meditrack-super-secret-2024";
const PORT = 4700;

function loadState(): State {
  if (!existsSync(STATE_PATH)) writeState();
  return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
}
const state = loadState();

interface Authed extends Request {
  userId?: string;
}

function auth(req: Authed, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return res.status(401).json({ error: "missing token" });
  try {
    const payload = jwt.verify(h.slice(7), JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
}

const app = express();
app.use(express.json());

app.get("/", (_req, res) => res.type("html").send(PAGE));

app.post("/api/login", (req, res) => {
  const { username, password } = req.body ?? {};
  const u = state.users.find((x) => x.username === username && x.password === password);
  if (!u) return res.status(401).json({ error: "invalid credentials" });
  const token = jwt.sign({ sub: u.id }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ token, userId: u.id, name: u.name });
});

// Correct: only the caller's own appointments.
app.get("/api/appointments", auth, (req: Authed, res) => {
  res.json(state.appointments.filter((a) => a.owner_id === req.userId));
});

// FLAW 1 (IDOR): authenticated, but never checks the appointment belongs to
// the caller — any logged-in user can read anyone's appointment by id.
app.get("/api/appointments/:id", auth, (req, res) => {
  const appt = state.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: "not found" });
  res.json(appt);
});

// FLAW 2 (missing auth): no auth middleware at all — any profile, no token.
app.get("/api/users/:id/profile", (req, res) => {
  const u = state.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: "not found" });
  const { password, ...safe } = u;
  res.json(safe);
});

app.listen(PORT, () => console.log(`MediTrack running on http://127.0.0.1:${PORT}`));

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MediTrack — Dr. Sharma's Clinic</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         background: #0d1117; color: #e6edf3; display: flex; min-height: 100vh;
         align-items: center; justify-content: center; padding: 24px; }
  .card { width: 100%; max-width: 560px; background: #161b22; border: 1px solid #30363d;
          border-radius: 14px; padding: 32px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .brand h1 { font-size: 26px; margin: 0; letter-spacing: -.5px; }
  .logo { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg,#2ea043,#238636);
          display: grid; place-items: center; font-size: 22px; }
  .sub { color: #8b949e; margin: 0 0 24px 52px; font-size: 14px; }
  label { display: block; font-size: 13px; color: #8b949e; margin: 14px 0 6px; }
  input { width: 100%; padding: 12px 14px; font-size: 16px; background: #0d1117;
          border: 1px solid #30363d; border-radius: 8px; color: #e6edf3; }
  button { margin-top: 22px; width: 100%; padding: 13px; font-size: 16px; font-weight: 600;
           background: #238636; color: #fff; border: 0; border-radius: 8px; cursor: pointer; }
  button:hover { background: #2ea043; }
  .hint { margin-top: 16px; font-size: 12px; color: #6e7681; text-align: center; }
  .appt { border: 1px solid #30363d; border-radius: 10px; padding: 16px; margin-top: 12px; background:#0d1117; }
  .appt .date { font-weight: 700; font-size: 17px; }
  .appt .doc { color: #8b949e; font-size: 14px; margin: 2px 0 8px; }
  .appt .reason { font-size: 15px; }
  .row { display:flex; justify-content: space-between; align-items:center; margin-bottom: 8px; }
  .muted { color:#8b949e; font-size: 14px; }
  .link { background: none; width: auto; margin: 0; padding: 6px 10px; font-size: 13px;
          color:#8b949e; border:1px solid #30363d; }
  .err { color:#f85149; font-size: 14px; margin-top: 12px; min-height: 18px; }
</style>
</head>
<body>
  <div class="card">
    <div id="login">
      <div class="brand"><div class="logo">🩺</div><h1>MediTrack</h1></div>
      <p class="sub">Dr. Sharma's Clinic · patient portal</p>
      <label>Email</label>
      <input id="email" type="email" placeholder="you@meditrack.test" autocomplete="username" />
      <label>Password</label>
      <input id="password" type="password" placeholder="••••••••" autocomplete="current-password" />
      <button onclick="login()">Sign in</button>
      <div class="err" id="err"></div>
      <p class="hint">Demo logins — anita@meditrack.test / anita-demo-2026 · rohan@meditrack.test / rohan-demo-2026</p>
    </div>
    <div id="app" style="display:none">
      <div class="row">
        <div class="brand"><div class="logo">🩺</div><h1>MediTrack</h1></div>
        <button class="link" onclick="logout()">Sign out</button>
      </div>
      <p class="muted" id="who"></p>
      <div id="list"></div>
    </div>
  </div>
<script>
  let token = null;
  async function login() {
    document.getElementById('err').textContent = '';
    const r = await fetch('/api/login', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ username: email.value, password: password.value }) });
    if (!r.ok) { document.getElementById('err').textContent = 'Invalid email or password.'; return; }
    const d = await r.json();
    token = d.token;
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('who').textContent = 'Signed in as ' + d.name;
    loadAppointments();
  }
  async function loadAppointments() {
    const r = await fetch('/api/appointments', { headers: { authorization: 'Bearer ' + token } });
    const items = await r.json();
    document.getElementById('list').innerHTML = items.map(a =>
      '<div class="appt"><div class="date">' + a.date + '</div>' +
      '<div class="doc">' + a.doctor + '</div>' +
      '<div class="reason">' + a.reason_for_visit + '</div></div>').join('');
  }
  function logout() {
    token = null;
    document.getElementById('app').style.display = 'none';
    document.getElementById('login').style.display = 'block';
    email.value = ''; password.value = '';
  }
</script>
</body>
</html>`;
