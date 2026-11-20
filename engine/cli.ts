// sudarshan CLI entry.
//   sudarshan scan <dir>          scan one app directory
//   sudarshan scan-all <appsDir>  scan every app subfolder, write a combined file

import { scan, scanAll } from "./scan";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "scan" && arg) {
    await scan(arg);
    return;
  }
  if (cmd === "scan-all" && arg) {
    await scanAll(arg);
    return;
  }
  console.error("usage: sudarshan scan <dir> | sudarshan scan-all <appsDir>");
  process.exit(2);
}

main().catch((e) => {
  console.error("sudarshan error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
