import assert from "node:assert/strict";
import { compare } from "./compare.ts";

const ids = Array.from({ length: 25 }, (_, index) => `app-${String(index + 1).padStart(2, "0")}`)
  .filter((id) => !["app-10", "app-23"].includes(id));
const baseline = (name: string) => ({ results: ids.map((id) => ({
  target: `eval/apps/${id}`, totalDurationMs: name === "llm" ? 100 : 20,
  findings: name === "llm" && ["app-01", "app-02", "app-03"].includes(id)
    ? [{ type: "example", endpoint: "/items/1", severity: "high" }] : [],
})) });
const sample = { results: [
  { appId: "app-01", toolName: "sudarshan", target: "http://127.0.0.1:3001",
    findings: [{ reproduced: true }], falsePositives: 0, totalDurationMs: 300 },
  { appId: "app-02", toolName: "sudarshan", target: "http://127.0.0.1:3002",
    findings: [], falsePositives: 0, totalDurationMs: 200 },
] };

const result = compare(sample as never, baseline("llm"), baseline("gitleaks"));
assert.equal(result.llm.flagged, 3);
assert.equal(result.llm.likelyTruePositive, 1);
assert.equal(result.llm.likelyFalsePositive, 1);
assert.equal(result.llm.unverifiable, 1);
assert.equal(result.sudarshan.proven, 1);
assert.equal(result.tools[0].avgRuntimeMs, 250);
assert.equal(result.tools[1].avgRuntimeMs, 100);
assert.equal(result.gitleaks.found, 0);
console.log("sample comparison passed");
