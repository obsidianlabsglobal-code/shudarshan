import "dotenv/config";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
const model = "claude-sonnet-5-5";
const appRoot = join(import.meta.dirname, "apps");
const resultRoot = join(import.meta.dirname, "results");
const outputPath = join(resultRoot, "llmreview-all.json");
const fixedPrompt = (await readFile(join(resultRoot, "llmreview-prompt.txt"), "utf8")).trimEnd();
const appIds = (await readdir(appRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^app-\d\d$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
if (appIds.length !== 23) throw new Error(`Expected 23 app folders, found ${appIds.length}`);

type ReviewResult = { toolName: string; target: string;
  findings: Array<{ type: string; endpoint: string; severity: string; verification: string }>;
  falsePositives: null; totalDurationMs: number; rawResponse: string };
let results: ReviewResult[] = [];
if (!process.argv.includes("--fresh")) {
  try {
    const saved = JSON.parse(await readFile(outputPath, "utf8")) as { results: ReviewResult[] };
    results = saved.results;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
async function save(): Promise<void> {
  const output = { toolName: "llm-review", model, apps: results.length,
    totalFindings: results.reduce((sum, item) => sum + item.findings.length, 0),
    totalDurationMs: results.reduce((sum, item) => sum + item.totalDurationMs, 0), results };
  await writeFile(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");
}
for (const id of appIds) {
  if (results.some((item) => item.target === `eval/apps/${id}`)) continue;
  const source = await readFile(join(appRoot, id, "server.ts"), "utf8");
  const started = performance.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 2048,
      messages: [{ role: "user", content: `${fixedPrompt}\n\n${source}` }] }),
  });
  if (!response.ok) throw new Error(`${id}: API returned HTTP ${response.status}`);
  const payload = await response.json() as { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
  if (payload.stop_reason !== "end_turn") throw new Error(`${id}: incomplete response`);
  const rawResponse = payload.content?.filter((part) => part.type === "text")
    .map((part) => part.text ?? "").join("") ?? "";
  const jsonText = rawResponse.trim().replace(/^```(?:json)?\s*\n/, "").replace(/\n```$/, "");
  const parsed = JSON.parse(jsonText) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${id}: review did not return an array`);
  const findings = parsed.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error(`${id}: invalid finding`);
    const record = item as Record<string, unknown>;
    if (typeof record.type !== "string" || typeof record.endpoint !== "string" ||
        typeof record.severity !== "string") throw new Error(`${id}: invalid finding fields`);
    return { type: record.type, endpoint: record.endpoint, severity: record.severity,
      verification: "unverified" };
  });
  const durationMs = Math.round(performance.now() - started);
  results.push({ toolName: "llm-review", target: `eval/apps/${id}`, findings,
    falsePositives: null, totalDurationMs: durationMs, rawResponse });
  await save();
  console.log(`${id}: ${findings.length} findings, ${durationMs} ms`);
}
