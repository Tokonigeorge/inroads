import "server-only";

/** Everything integrations do over the network goes through this, so tests can swap it. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class ReauthRequired extends Error {
  constructor(public provider: string) {
    super(`${provider} access has expired or was removed. Reconnect to keep syncing.`);
  }
}
export class SyncTokenExpired extends Error {}
export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Provider endpoints. In end-to-end tests TEST_FAKE_PROVIDERS_URL points every call at a local
 * stand-in server. It's server-only configuration, never set in production.
 */
export function providerUrl(provider: "google" | "microsoft", real: string): string {
  const fake = process.env.TEST_FAKE_PROVIDERS_URL;
  if (!fake) return real;
  const u = new URL(real);
  return `${fake.replace(/\/$/, "")}/${provider}/${u.host}${u.pathname}${u.search}`;
}

export async function getJson<T>(fetchImpl: Fetch, url: string, accessToken: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...headers } });
  if (res.status === 401) throw new ReauthRequired("provider");
  if (res.status === 410) throw new SyncTokenExpired();
  if (!res.ok) throw new ProviderError(`Request failed (${res.status})`, res.status);
  return (await res.json()) as T;
}

export async function postForm<T>(fetchImpl: Fetch, url: string, form: Record<string, string>): Promise<{ status: number; body: T }> {
  const res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}
