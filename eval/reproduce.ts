import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
await access(tsxCli);

const steps: Array<[string, string[]]> = [
  ["gitleaks", ["eval/baseline.ts"]],
  ["LLM review", ["eval/llm-review.ts", "--fresh"]],
  ["Sudarshan", ["engine/cli.ts", "scan-all", "eval/apps"]],
  ["comparison", ["eval/compare.ts", "--run"]],
];

if (process.argv.includes("--dry-run")) {
  for (const [name, args] of steps) console.log(`${name}: ${args.join(" ")}`);
  process.exit(0);
}

for (const [name, args] of steps) {
  console.log(`\n=== ${name} ===`);
  const code = await new Promise<number>((done, fail) => {
    const child = spawn(process.execPath, [tsxCli, ...args], {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", fail);
    child.on("exit", (status) => done(status ?? 1));
  });
  if (code !== 0) throw new Error(`${name} failed with exit code ${code}`);
}
