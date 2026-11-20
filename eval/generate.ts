import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prompts } from "./prompts.ts";

const key = process.env.ANTHROPIC_API_KEY;
if (!key) throw new Error("ANTHROPIC_API_KEY is not set");

const requested = process.argv.slice(2);
if (requested.length === 0 || requested.some((id) => !["app-01", "app-16"].includes(id))) {
  throw new Error("Specify app-01 and/or app-16 only");
}

const outputNames = ["server.ts", "package.json", "sudarshan.json", "README.md"] as const;
type OutputName = (typeof outputNames)[number];

for (const id of requested) {
  const entry = prompts.find((item) => item.id === id);
  if (!entry) throw new Error(`Unknown app: ${id}`);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
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

  const directory = join(import.meta.dirname, "apps", id);
  await mkdir(directory, { recursive: true });
  for (const name of outputNames) await writeFile(join(directory, name), files[name], "utf8");
  console.log(`${id}: wrote ${outputNames.join(", ")}`);
}
