// Thin HTTP client. One request in, one result out. No retries, no state.

import { HttpResult, SentRequest } from "../shared/types";

export async function send(
  method: string,
  url: string,
  token?: string,
): Promise<HttpResult> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { method, headers });
  const body = await res.text();
  const outHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    outHeaders[k] = v;
  });
  return { status: res.status, headers: outHeaders, body };
}

// An evidence-safe view of a request: the bearer token is never recorded.
export function redactRequest(
  method: string,
  url: string,
  token?: string,
): SentRequest {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = "Bearer <redacted>";
  return { method, url, headers };
}
