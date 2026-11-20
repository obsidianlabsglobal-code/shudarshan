// Typed accessors over the REAL collected eval data. Every number the UI shows
// comes from here; a missing file is null and renders as "—", never a guess.

import { results } from "../data/results.generated";
import type { ScanResult } from "@shared/result";

export interface AuthAll {
  total: number;
  scanned: number;
  leaked: number;
  clean: number;
  unscannable: number;
  totalRecordsExposed: number;
  falsePositives: number;
  avgSecondsPerApp: number;
  results: (ScanResult & { app: string })[];
}

export interface SecretApp {
  app: string;
  embeddedSecret?: "present" | "none";
  findings?: SecretFinding[];
  status?: string;
  reason?: string;
}

export interface SecretFinding {
  attackClass: "HARDCODED_SECRET";
  target: string;
  victim: string;
  embeddedSecretMasked: string;
  resource: string;
  leakedFields: string[];
  markerMasked: string;
  reproduced: boolean;
  evidence: {
    forgedRequest: { method: string; url: string; headers: Record<string, string> };
    forgedStatus: number;
    legitUserStatus: number;
    unknownSecretStatus: number;
  };
}

export interface SecretAll {
  total: number;
  hardcodedSecret: number;
  randomSecret: number;
  provableWeakness: number;
  clean: number;
  unscannable: number;
  falsePositives: number;
  apps: SecretApp[];
}

export interface Gitleaks {
  toolName: string;
  apps: number;
  totalFindings: number;
  totalDurationMs: number;
}

export interface LlmReview {
  totalFlags: number;
  categories: Record<string, number>;
  method: string;
  flags: unknown[];
}

export interface Regression {
  experiment: string;
  model: string;
  fixedPrompt: string;
  total: number;
  ownershipKept: number;
  ownershipLost: number;
  unscannable: number;
  apps: { app: string; status: string; findings: number }[];
}

export interface Interval {
  lower: number;
  upper: number;
}

export interface StatBlock {
  label: string;
  numerator: number | null;
  denominator: number | null;
  rate: number | null;
  confidenceInterval95: Interval | null;
  status?: string;
  reason?: string;
}

export interface Stats {
  method: string;
  appsLeaked: StatBlock;
  falsePositives: { sudarshan: StatBlock; llmReview: StatBlock; gitleaks: StatBlock };
  regressionOwnershipLoss: StatBlock;
}

const r = results as unknown as {
  authorization: AuthAll | null;
  secret: SecretAll | null;
  gitleaks: Gitleaks | null;
  llmReview: LlmReview | null;
  regression: Regression | null;
  stats: Stats | null;
};

export const authorization = r.authorization;
export const secret = r.secret;
export const gitleaks = r.gitleaks;
export const llmReview = r.llmReview;
export const regression = r.regression;
export const stats = r.stats;

/** Render a value, or an em dash if it is absent. */
export function dash(v: number | string | null | undefined): string {
  return v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) ? "—" : String(v);
}
