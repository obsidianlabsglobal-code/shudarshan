// Shared request/response shapes. Owner: Krishna. Other agents: read-only.

export interface Identity {
  label: string; // display label, e.g. "A" or "B" (never a real name)
  token: string; // bearer token for this user
  userId: string; // the user's own id, used to assert attacker !== victim
}

export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: string; // raw text; callers parse lazily
}

export interface SentRequest {
  method: string;
  url: string;
  headers: Record<string, string>; // secrets already stripped, safe for evidence
}
