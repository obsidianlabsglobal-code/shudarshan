// Finding record + marker masking. Owner: Krishna. Other agents: read-only.

import { SentRequest } from "./types";

export interface Evidence {
  attackRequest: SentRequest; // attacker's request for the victim's resource
  provingStatus: number; // the status that proved the leak (expect 200)
  controlOwnStatus: number; // attacker -> own resource (expect 200)
  controlNoAuthStatus: number; // no-auth -> victim resource (expect 401/403)
}

export interface Finding {
  attackClass: "BOLA"; // only the agreed classes are allowed
  target: string; // base url under test
  victim: string; // label of the user whose data leaked
  attacker: string; // label of the user who read it
  resource: string; // endpoint path that leaked
  markerMasked: string; // victim's proving marker, MASKED for screen
  reproduced: boolean; // true only when proven twice
  evidence: Evidence;
}

// Keep first 2 and last 2 characters, replace the middle with X.
// "9876543210" -> "98XXXXXX10". Nothing readable reaches a projector.
export function maskMarker(raw: string): string {
  if (raw.length <= 4) return "X".repeat(raw.length);
  return raw.slice(0, 2) + "X".repeat(raw.length - 4) + raw.slice(-2);
}
