// Process control for an app we own. tsx spawns a child node process, so we run
// detached and kill the whole process group — killing only the tsx wrapper
// would leave the real server holding the port.

import { spawn, type ChildProcess } from "node:child_process";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function portUp(baseUrl: string): Promise<boolean> {
  try {
    await fetch(baseUrl + "/");
    return true;
  } catch {
    return false;
  }
}

export function killTree(p: ChildProcess): void {
  try {
    if (p.pid) process.kill(-p.pid, "SIGKILL");
  } catch {
    try {
      p.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

export async function startServer(
  baseUrl: string,
  file: string,
  opts: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
): Promise<ChildProcess> {
  const tsx = process.cwd() + "/node_modules/.bin/tsx";
  const proc = spawn(tsx, [file], {
    stdio: "ignore",
    detached: true,
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
  for (let i = 0; i < 60; i++) {
    if (await portUp(baseUrl)) return proc;
    await sleep(200);
  }
  killTree(proc);
  throw new Error(`server did not start: ${file}`);
}

export async function stopServer(baseUrl: string, p: ChildProcess): Promise<void> {
  killTree(p);
  for (let i = 0; i < 50; i++) {
    if (!(await portUp(baseUrl))) return; // wait until the port is actually free
    await sleep(200);
  }
}
