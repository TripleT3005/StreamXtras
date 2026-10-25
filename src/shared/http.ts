// Constants
const defaultTimeoutMs = 10_000;

// Requests
export async function fetchJson(url: string, timeoutMs: number = defaultTimeoutMs): Promise<unknown> {
  const response = await fetch(url, {
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

export function toHttpsUrl(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}
