// sudarshan CLI entry.
//   sudarshan scan <dir>          scan one app directory
//   sudarshan scan-all <appsDir>  scan every app subfolder, write a combined file
//   sudarshan serve               local web console over `verify` (localhost, demo apps only)

import { scan, scanAll } from "./scan";
import { scanSecretAll } from "./secret";
import { verifyApp, watchApp } from "./verifyflow";
import { serve } from "./serve";

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
  if (cmd === "secret-all" && arg) {
    await scanSecretAll(arg);
    return;
  }
  if (cmd === "serve") {
    const i = process.argv.indexOf("--port");
    await serve(i > 0 ? Number(process.argv[i + 1]) : 4545); // local presentation layer over the CLI
    return;
  }
  if (cmd === "verify" && arg) {
    if (process.argv.includes("--watch")) {
      await watchApp(arg); // tolerant of non-zero verdicts; keeps watching
    } else {
      const r = await verifyApp(arg);
      process.exitCode = r.exitCode; // VULNERABLE=1 · INCONCLUSIVE=2 · NO_LEAK_DETECTED=0
      process.exit(r.exitCode); // return to the shell right after the verdict (verify.ts stays the authority)
    }
    return;
  }
  console.error("usage: sudarshan scan <dir> | sudarshan scan-all <appsDir> | sudarshan secret-all <appsDir> | sudarshan verify <dir> [--watch] | sudarshan serve [--port N] [--rebuild]");
  process.exit(2);
}

main().catch((e) => {
  console.error("sudarshan error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
