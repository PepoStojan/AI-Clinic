// Deliberately simple normalization -- enough to catch obvious duplicate
// target URLs (case, trailing slash, fragment), not a full canonicalization
// engine. registered_domain strips only a leading "www." (no public-suffix
// parsing), matching the MVP scope for CORE-001.

export function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function extractRegisteredDomain(rawUrl: string): string {
  const { hostname } = new URL(rawUrl);
  return hostname.toLowerCase().replace(/^www\./, "");
}
