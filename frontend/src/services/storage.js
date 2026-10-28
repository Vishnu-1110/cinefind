export const WATCHLIST_KEY = "cinefind_watchlist";
export const LIKES_KEY = "cinefind_likes";

export function readStoredList(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}
export function writeStoredList(key, items) {
  try { localStorage.setItem(key, JSON.stringify(items)); return true; }
  catch { return false; }
}
export function hasTitle(items, item, mediaType = item?.media_type || "movie") {
  return items.some(saved => Number(saved.id) === Number(item.id) && saved.media_type === mediaType);
}
export function toggleStoredTitle(items, item, mediaType = item?.media_type || "movie") {
  if (hasTitle(items, item, mediaType)) {
    return items.filter(saved => !(Number(saved.id) === Number(item.id) && saved.media_type === mediaType));
  }
  return [{
    id: Number(item.id), media_type: mediaType, title: item.title || item.name || "Untitled",
    name: item.name, poster_path: item.poster_path || null, backdrop_path: item.backdrop_path || null,
    release_date: item.release_date || "", first_air_date: item.first_air_date || "",
    vote_average: Number(item.vote_average) || 0, overview: item.overview || "", genre_ids: item.genre_ids || [],
  }, ...items];
}
