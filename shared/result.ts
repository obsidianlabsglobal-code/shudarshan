// Scan result shape. Owner: Krishna. One of these per scanned app.

import { Finding } from "./finding";

export interface ScanResult {
  toolName: string; // always "sudarshan"
  target: string; // the base url that was scanned
  findings: Finding[]; // only proven, reproduced, control-verified findings
  falsePositives: number; // 0 by construction — nothing unproven is emitted
  totalDurationMs: number; // wall-clock time for the whole scan
}
