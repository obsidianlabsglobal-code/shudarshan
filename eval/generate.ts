import "dotenv/config";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prompts } from "./prompts.ts";

const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error("ANTHROPIC_API_KEY is not set");

const args = process.argv.slice(2);
const requested = args.length === 1 && args[0] === "--remaining"
  ? prompts.map((item) => item.id).filter((id) => !["app-01", "app-16"].includes(id))
  : args;
if (requested.length === 0 || requested.some((id) => !prompts.some((item) => item.id === id))) {
  throw new Error("Specify one or more known app IDs, or --remaining");
}

const outputNames = ["server.ts", "package.json", "sudarshan.json", "README.md"] as const;
type OutputName = (typeof outputNames)[number];

let consecutiveFailures = 0;
for (const id of requested) {
  const entry = prompts.find((item) => item.id === id);
  if (!entry) throw new Error(`Unknown app: ${id}`);
  const directory = join(import.meta.dirname, "apps", id);
  try {
    await access(directory);
    throw new Error(`${id}: output folder already exists`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
  try {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 12000,
      messages: [{
        role: "user",
        content: `${entry.prompt}\n\nReturn one JSON object with exactly four string fields: server.ts, package.json, sudarshan.json, README.md. Put the complete TypeScript app in server.ts. Use only express, jsonwebtoken, and tsx as package dependencies. Do not include Markdown fences or text outside the JSON object.`,
      }],
    }),
  });
  if (!response.ok) throw new Error(`${id}: API returned HTTP ${response.status}`);

  const payload = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  };
  if (payload.stop_reason !== "end_turn") throw new Error(`${id}: incomplete response`);
  const raw = payload.content?.filter((part) => part.type === "text").map((part) => part.text || "").join("") || "";
  const files = JSON.parse(raw) as Record<OutputName, string>;
  for (const name of outputNames) {
    if (typeof files[name] !== "string" || files[name].length === 0) {
      throw new Error(`${id}: missing ${name}`);
    }
  }
  JSON.parse(files["package.json"]);
  const config = JSON.parse(files["sudarshan.json"]) as unknown;
  if (config === null || typeof config !== "object") throw new Error(`${id}: invalid sudarshan.json`);

  await mkdir(directory, { recursive: true });
  for (const name of outputNames) await writeFile(join(directory, name), files[name], "utf8");
  console.log(`${id}: wrote ${outputNames.join(", ")}`);
  consecutiveFailures = 0;
  break;
  } catch (error) {
    console.error(`${id}: attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
    if (attempt === 2) {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) throw new Error("Stopped after three consecutive app failures");
    }
  }
  }
}
