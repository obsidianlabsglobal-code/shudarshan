import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dirname, "results");
const llm = JSON.parse(await readFile(join(root, "llmreview-all.json"), "utf8")) as {
  results: Array<{ target: string; findings: Array<{ type: string; endpoint: string; severity: string }> }>;
};
const sudarshan = JSON.parse(await readFile(join(root, "sudarshan-all.json"), "utf8")) as {
  results: Array<{ appId?: string; target: string; findings: unknown[]; error?: string; status?: string }>;
};

const categories = ["authorization / access control", "authentication", "secrets", "injection",
  "input validation", "dependencies", "other"] as const;
type Category = (typeof categories)[number];

function classify(text: string): Category {
  const value = text.toLowerCase();
  if (/ownership|idor|bola|cross.user|access control|authori[sz]ation|other user/.test(value))
    return "authorization / access control";
  if (/jwt.*secret|signing secret|api key|token secret|secret leak|exposed secret/.test(value))
    return "secrets";
  if (/injection|sql|command execution|xss|script injection/.test(value)) return "injection";
  if (/input validation|unsanitized input|malformed input/.test(value)) return "input validation";
  if (/dependenc|outdated package|vulnerable package/.test(value)) return "dependencies";
  if (/credential|password|login|brute.force|rate limit|lockout|user enumeration|authentication|token/.test(value))
    return "authentication";
  return "other";
}

function idOf(row: { appId?: string; target: string }): string | null {
  const id = row.appId ?? row.target.match(/app-(0[1-9]|1\d|2[0-5])/)?.[0];
  if (id) return id;
  try {
    const port = Number(new URL(row.target).port);
    if (port >= 3001 && port <= 3025) return `app-${String(port - 3000).padStart(2, "0")}`;
  } catch { /* Target may be a local path. */ }
  return null;
}

const scanned = new Map<string, number>();
for (const row of sudarshan.results) {
  const id = idOf(row);
  if (id && !row.error && row.status !== "failed" && Array.isArray(row.findings))
    scanned.set(id, row.findings.length);
}

const flags = llm.results.flatMap((row) => row.findings.map((finding) => {
  const appId = idOf(row);
  if (!appId) throw new Error(`Cannot identify app for ${row.target}`);
  const category = classify(finding.type);
  const assessment = category !== "authorization / access control"
    ? "unverified (outside Sudarshan's scope)"
    : !scanned.has(appId) ? "unverified (app not tested by Sudarshan)"
      : scanned.get(appId) === 0 ? "not confirmed when tested"
        : "unverified (app has a proven finding; this claim was not individually tested)";
  return { appId, ...finding, category, assessment };
}));
if (flags.length !== 33) throw new Error(`Expected 33 LLM flags, found ${flags.length}`);
const counts = Object.fromEntries(categories.map((category) =>
  [category, flags.filter((flag) => flag.category === category).length]));
const output = { totalFlags: flags.length, categories: counts,
  method: "Category uses each flag's type text. Sudarshan currently tests BOLA; non-authorization flags remain unverified. A clean scanned app can only fail to confirm an authorization flag, not prove it false.",
  flags };
await writeFile(join(root, "llmreview-classified.json"), JSON.stringify(output, null, 2) + "\n");
console.log("Category\tFlags");
for (const category of categories) console.log(`${category}\t${counts[category]}`);
