// Finding record + marker masking. Owner: Krishna.
// leakedFields holds field NAMES only — never values.

import { SentRequest } from "./types";

export interface Evidence {
  attackRequest: SentRequest; // attacker's request for the victim's resource
  provingStatus: number; // the status that proved the leak (expect 200)
  controlOwnStatus: number; // attacker -> own resource (expect 200)
  controlNoAuthStatus: number; // no-auth -> victim resource (expect 401/403)
  controlForgedStatus: number; // forged token -> victim resource (expect 401/403)
}

export interface Remediation {
  template: string; // which fixed template was applied
  reattackResult: "blocked" | "still-vulnerable";
  fixOutcome: "VALID" | "BROKE-APP" | "STILL-VULNERABLE";
  reattackStatus: number; // attacker's status after the fix
  ownControlStatus: number; // legitimate user's status after the fix (expect 200)
  testFile?: string; // path to the generated regression test, if written
}

export interface Finding {
  attackClass: "BOLA"; // only the agreed classes are allowed
  target: string; // base url under test
  victim: string; // label of the user whose data leaked
  attacker: string; // label of the user who read it
  resource: string; // endpoint path that leaked
  leakedFields: string[]; // disclosed field NAMES only, never values
  markerMasked: string; // victim's proving marker, MASKED for screen
  reproduced: boolean; // true only when proven twice
  evidence: Evidence;
  remediation?: Remediation; // present once a fix has been attempted
}

// Keep first 2 and last 2 characters, replace the middle with X.
// "9876543210" -> "98XXXXXX10". Nothing readable reaches a projector.
export function maskMarker(raw: string): string {
  if (raw.length <= 4) return "X".repeat(raw.length);
  return raw.slice(0, 2) + "X".repeat(raw.length - 4) + raw.slice(-2);
}
