const configuredApiUrl = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE_URL = (configuredApiUrl || (import.meta.env.DEV ? "http://127.0.0.1:8001" : "")).replace(/\/$/, "");
const inFlightRequests = new Map();

export const TMDB_IMAGE = "https://image.tmdb.org/t/p/w500";
export const TMDB_BACKDROP = "https://image.tmdb.org/t/p/original";
export const TMDB_PROVIDER_IMAGE = "https://image.tmdb.org/t/p/w185";

export async function backendApi(path, options = {}) {
  if (!API_BASE_URL) throw new Error("CineFind's online API address has not been configured yet.");
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, credentials: options.credentials || "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `CineFind API returned ${response.status}.`);
  return data;
}

export async function tmdb(path, params = {}) {
  const safePath = String(path).replace(/^\/+/, "");
  const query = new URLSearchParams(params);
  const suffix = query.size ? `?${query.toString()}` : "";
  const url = `/api/tmdb/${safePath}${suffix}`;
  if (inFlightRequests.has(url)) return inFlightRequests.get(url);

  const request = backendApi(url);
  inFlightRequests.set(url, request);
  try { return await request; }
  finally { inFlightRequests.delete(url); }
}

export function titleFor(item) { return item?.title || item?.name || "Untitled"; }
export function dateFor(item) { return item?.release_date || item?.first_air_date || ""; }

export function dedupeByMedia(items) {
  const unique = new Map();
  for (const item of items || []) {
    const mediaType = item.media_type || (item.first_air_date || item.name ? "tv" : "movie");
    if (item.id != null) unique.set(`${mediaType}:${item.id}`, { ...item, media_type: mediaType });
  }
  return [...unique.values()];
}

export function getProviderCatalog(providerResponse) {
  return Array.isArray(providerResponse?.results) ? providerResponse.results : [];
}

export function getIndiaProviders(providerResponse) {
  const india = providerResponse?.results?.IN;
  return india ? [...(india.flatrate || []), ...(india.free || []), ...(india.ads || []), ...(india.rent || []), ...(india.buy || [])] : [];
}
