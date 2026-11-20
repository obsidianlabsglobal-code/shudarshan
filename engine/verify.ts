// Deterministic proof of a BOLA leak. No LLM, no heuristics about intent —
// only HTTP status, byte matching, and identity checks decide the verdict.

import { HttpResult } from "../shared/types";

export interface Verdict {
  proven: boolean;
  reasons: string[]; // why it failed; empty when proven
  marker: string | null;
}

// Pull a stable, unique-looking marker out of the victim's own resource:
// the longest run of >= 6 digits (account number, id, phone). App-agnostic.
export function extractMarker(body: string): string | null {
  const runs = body.match(/\d{6,}/g);
  if (!runs || runs.length === 0) return null;
  return runs.sort((a, b) => b.length - a.length)[0];
}

function leaks(marker: string | null, r: HttpResult): boolean {
  return marker !== null && r.status === 200 && r.body.includes(marker);
}

function rejected(r: HttpResult): boolean {
  return r.status === 401 || r.status === 403;
}

// Proven ONLY if: attacker != victim, a marker exists, BOTH attack runs return
// it at 200 (reproduced), the attacker can read their own resource (200), and
// BOTH an unauthenticated and a forged-token request for the victim resource
// are rejected (401/403). The forged-token control proves the server actually
// validates tokens, so the leak is an authorization flaw, not broken auth.
export function judge(
  attackerId: string,
  victimId: string,
  marker: string | null,
  attack1: HttpResult,
  attack2: HttpResult,
  controlOwn: HttpResult,
  controlNoAuth: HttpResult,
  controlForged: HttpResult,
): Verdict {
  const reasons: string[] = [];
  if (attackerId === victimId) reasons.push("attacker and victim are the same user");
  if (!marker) reasons.push("no stable marker in victim resource");
  if (!leaks(marker, attack1)) reasons.push("first attack did not return victim marker at 200");
  if (!leaks(marker, attack2)) reasons.push("second attack did not reproduce the leak");
  if (controlOwn.status !== 200) reasons.push("control failed: attacker cannot read own resource");
  if (!rejected(controlNoAuth)) reasons.push("control failed: unauthenticated request was not rejected");
  if (!rejected(controlForged)) reasons.push("control failed: forged token was not rejected");
  return { proven: reasons.length === 0, reasons, marker };
}
