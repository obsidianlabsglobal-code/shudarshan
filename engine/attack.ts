// Shared attack primitives. bola.ts, reprove.ts and scan.ts all call
// runCandidate so the re-attack after a fix is byte-for-byte the same sequence
// as the original.

import { readFileSync } from "node:fs";
import { send } from "./probe";
import { extractMarker, judge, type Verdict } from "./verify";
import type { HttpResult } from "../shared/types";

export interface ConfigUser {
  label: string;
  username: string;
  password: string;
}

export interface AppControl {
  startFile?: string; // relative to the app dir; if set, scan manages the process
  fixFile?: string; // source file to patch
  fixedBuild?: string; // where the patched build is written
}

export interface Config {
  baseUrl: string;
  login: { path: string };
  listOwn: string;
  resourceTemplate: string; // contains "{id}"
  users: ConfigUser[];
  app?: AppControl;
}

export interface Session {
  label: string;
  userId: string;
  token: string;
}

export interface CandidateResult {
  marker: string | null;
  leakedFields: string[];
  attack1: HttpResult;
  attack2: HttpResult;
  controlOwn: HttpResult;
  controlNoAuth: HttpResult;
  controlForged: HttpResult;
  verdict: Verdict;
}

// A well-formed but invalid-signature JWT. A correctly built app rejects it.
export const FORGED_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmb3JnZWQtdXNlciJ9.c2lnbmF0dXJlX2lzX2ludmFsaWQ";

export function loadConfig(path: string): Config {
  return JSON.parse(readFileSync(path, "utf8")) as Config;
}

export function resourceUrl(cfg: Config, id: string): string {
  return cfg.baseUrl + cfg.resourceTemplate.replace("{id}", id);
}

export async function login(cfg: Config, u: ConfigUser): Promise<Session> {
  const res = await fetch(cfg.baseUrl + cfg.login.path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u.username, password: u.password }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${u.label}: HTTP ${res.status}`);
  const data = (await res.json()) as any;
  if (!data.token || !data.userId) throw new Error(`login for ${u.label} returned no token/userId`);
  return { label: u.label, userId: data.userId, token: data.token };
}

export async function loginAll(cfg: Config): Promise<Session[]> {
  const out: Session[] = [];
  for (const u of cfg.users) out.push(await login(cfg, u));
  return out;
}

export async function harvestIds(cfg: Config, s: Session): Promise<string[]> {
  const r = await send("GET", cfg.baseUrl + cfg.listOwn, s.token);
  const items = JSON.parse(r.body) as any;
  if (!Array.isArray(items)) return [];
  return items.map((x: any) => x.id).filter((id: unknown): id is string => typeof id === "string");
}

// Deterministic: the fields disclosed are exactly the top-level keys the
// attacker received in a 200 response. No guessing, no model.
export function extractLeakedFields(r: HttpResult): string[] {
  if (r.status !== 200) return [];
  try {
    const o = JSON.parse(r.body);
    return o && typeof o === "object" ? Object.keys(o) : [];
  } catch {
    return [];
  }
}

// The full replay matrix for one candidate: victim reads own (for the marker),
// attacker replays twice (reproduction), then anonymous and forged-token
// controls. judge() turns these into a deterministic verdict.
export async function runCandidate(
  cfg: Config,
  victim: Session,
  attacker: Session,
  id: string,
): Promise<CandidateResult> {
  const url = resourceUrl(cfg, id);
  const victimRes = await send("GET", url, victim.token);
  const marker = extractMarker(victimRes.body);
  const attack1 = await send("GET", url, attacker.token);
  const attack2 = await send("GET", url, attacker.token);
  const controlOwn = await send("GET", cfg.baseUrl + cfg.listOwn, attacker.token);
  const controlNoAuth = await send("GET", url);
  const controlForged = await send("GET", url, FORGED_TOKEN);
  const verdict = judge(
    attacker.userId, victim.userId, marker,
    attack1, attack2, controlOwn, controlNoAuth, controlForged,
  );
  const leakedFields = extractLeakedFields(attack1);
  return { marker, leakedFields, attack1, attack2, controlOwn, controlNoAuth, controlForged, verdict };
}
