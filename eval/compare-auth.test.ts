import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { compareAuthentication } from "./compare";

const classified = JSON.parse(await readFile(join(import.meta.dirname,
  "results", "llmreview-classified.json"), "utf8"));
const flaggedApps = [...new Set<string>(classified.flags.filter((flag: { category: string }) =>
  flag.category === "authentication").map((flag: { appId: string }) => flag.appId))].sort();

const pending = compareAuthentication(classified, null);
assert.equal(pending.status, "pending");
assert.equal(pending.flaggedClaims, 28);
assert.equal(pending.llmFlaggedApps, 14);

const sample = { results: [
  { app: flaggedApps[0], findings: [{ reproduced: true }] },
  { app: flaggedApps[1], findings: [] },
  { app: flaggedApps[2], status: "failed", findings: [] },
] };
const agreement = compareAuthentication(classified, sample);
assert.equal(agreement.status, "available");
assert.equal(agreement.sudarshanProvedApps, 1);
assert.equal(agreement.sudarshanCleanApps, 1);
assert.equal(agreement.unscannableApps, 12);
console.log("Authentication sample shape: 14 flagged apps; 1 proved, 1 clean, 12 unscannable");
