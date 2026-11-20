// Fixed-template remediation. Fixes are never generated free-form — the same
// vulnerable source always produces the same patched source. Template #1 is an
// ownership check inserted into the IDOR route handler.

import { readFileSync, writeFileSync } from "node:fs";

export interface FixTemplate {
  id: string;
  vulnerable: string; // exact text to match in the source
  fixed: string; // exact replacement
}

export const OWNERSHIP_CHECK: FixTemplate = {
  id: "ownership-check",
  vulnerable:
`app.get("/api/appointments/:id", auth, (req, res) => {
  const appt = state.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: "not found" });
  res.json(appt);
});`,
  fixed:
`app.get("/api/appointments/:id", auth, (req, res) => {
  const appt = state.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: "not found" });
  // FIX (template: ownership-check) — the resource must belong to the caller.
  if (appt.owner_id !== (req as Authed).userId) return res.status(403).json({ error: "forbidden" });
  res.json(appt);
});`,
};

export interface FixResult {
  template: string;
  applied: boolean;
  sourcePath: string;
  fixedPath: string;
}

// Apply a template to sourcePath and write the patched source to fixedPath.
// Requires the vulnerable text to appear exactly once, or it refuses (applied:false).
export function applyFix(sourcePath: string, template: FixTemplate, fixedPath: string): FixResult {
  const src = readFileSync(sourcePath, "utf8");
  const occurrences = src.split(template.vulnerable).length - 1;
  if (occurrences !== 1) return { template: template.id, applied: false, sourcePath, fixedPath };
  writeFileSync(fixedPath, src.replace(template.vulnerable, template.fixed));
  return { template: template.id, applied: true, sourcePath, fixedPath };
}

// Runnable: patch the victim app into a sibling fixed build.
const entry = process.argv[1] ?? "";
if (entry.endsWith("fix.ts")) {
  const r = applyFix("victim/server.ts", OWNERSHIP_CHECK, "victim/.server.fixed.ts");
  console.log(
    r.applied
      ? `fix applied (${r.template}) -> ${r.fixedPath}`
      : `fix NOT applied: template '${r.template}' did not match the source exactly once`,
  );
}
