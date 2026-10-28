import { backendApi, dedupeByMedia, tmdb } from "./tmdb";

export const EMPTY_FILTERS = {
  contentType: "all", tvSource: "popular", genres: [], yearFrom: "", yearTo: "", minRating: "", ratingExclusive: false,
  maxRating: "", ratingMaxExclusive: false, language: "", region: "", maxRuntime: "",
  runtimeExclusive: false, minSeasons: "", maxSeasons: "", providerId: "", sortBy: "relevance",
};

export async function parseNaturalQuery(query) {
  return backendApi("/api/discovery/parse", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
}

function genreNamesForType(type, genres) {
  const aliases = {
    "science fiction": ["science fiction", "sci-fi & fantasy"],
    "sci-fi & fantasy": ["science fiction", "sci-fi & fantasy"],
    action: ["action", "action & adventure"],
    adventure: ["adventure", "action & adventure"],
    "action & adventure": ["action", "adventure", "action & adventure"],
  };
  const wanted = new Set((genres || []).map(name => String(name).toLowerCase()));
  return (genres || []).flatMap(name => aliases[String(name).toLowerCase()] || [String(name).toLowerCase()]);
}

function genreIds(type, names, movieGenres, tvGenres) {
  const available = type === "tv" ? tvGenres : movieGenres;
  const requested = genreNamesForType(type, names);
  return [...new Set(available.filter(genre => requested.includes(genre.name.toLowerCase())).map(genre => genre.id))];
}

function sortParam(sortBy, type) {
  if (sortBy === "rating") return "vote_average.desc";
  if (sortBy === "popularity") return "popularity.desc";
  if (sortBy === "release_date") return type === "tv" ? "first_air_date.desc" : "primary_release_date.desc";
  return "popularity.desc";
}

function basicFilter(items, filters, movieGenres, tvGenres) {
  const pickedGenres = filters.genres || [];
  return items.filter(item => {
    const type = item.media_type;
    const ids = genreIds(type, pickedGenres, movieGenres, tvGenres);
    if (pickedGenres.length && (!ids.length || !(item.genre_ids || []).some(id => ids.includes(Number(id))))) return false;
    const date = type === "tv" ? item.first_air_date : item.release_date;
    const year = Number(String(date || "").slice(0, 4));
    if (filters.yearFrom && (!year || year < Number(filters.yearFrom))) return false;
    if (filters.yearTo && (!year || year > Number(filters.yearTo))) return false;
    const rating = Number(item.vote_average);
    if (filters.minRating !== "" && (!Number.isFinite(rating) || (filters.ratingExclusive ? rating <= Number(filters.minRating) : rating < Number(filters.minRating)))) return false;
    if (filters.maxRating !== "" && (!Number.isFinite(rating) || (filters.ratingMaxExclusive ? rating >= Number(filters.maxRating) : rating > Number(filters.maxRating)))) return false;
    if (filters.language && item.original_language !== filters.language) return false;
    return true;
  });
}

async function fetchRuntimeDetails(items) {
  const enriched = [];
  for (let i = 0; i < items.length; i += 8) {
    const batch = items.slice(i, i + 8);
    enriched.push(...await Promise.all(batch.map(async item => {
      try {
        const details = await tmdb(`${item.media_type}/${item.id}`, { language: "en-US" });
        const runtimes = (details.episode_run_time || []).map(Number).filter(value => value > 0);
        const runtime = item.media_type === "tv"
          ? (runtimes[0] || null)
          : (Number(details.runtime) || null);
        return { ...item, runtime_minutes: runtime, number_of_seasons: Number(details.number_of_seasons) || 0 };
      } catch { return { ...item, runtime_minutes: null, number_of_seasons: null }; }
    })));
  }
  return enriched;
}

function sortItems(items, sortBy) {
  const date = item => String(item.media_type === "tv" ? item.first_air_date || "" : item.release_date || "");
  if (sortBy === "rating") return items.sort((a, b) => Number(b.vote_average || 0) - Number(a.vote_average || 0) || Number(b.vote_count || 0) - Number(a.vote_count || 0));
  if (sortBy === "release_date") return items.sort((a, b) => date(b).localeCompare(date(a)));
  if (sortBy === "popularity") return items.sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));
  return items;
}

function explainMatch(item, filters) {
  const reasons = [];
  if (filters.genres?.length) reasons.push(`genre: ${filters.genres.join(", ")}`);
  if (filters.yearFrom || filters.yearTo) reasons.push(`year: ${filters.yearFrom || "any"}–${filters.yearTo || "present"}`);
  if (filters.minRating !== "") reasons.push(`rating ${filters.ratingExclusive ? ">" : "≥"} ${filters.minRating}`);
  if (filters.maxRating !== "") reasons.push("rating " + (filters.ratingMaxExclusive ? "<" : "≤") + " " + filters.maxRating);
  if (filters.language) reasons.push(`original language: ${filters.language.toUpperCase()}`);
  if (filters.maxRuntime) reasons.push(`runtime ${filters.runtimeExclusive ? "<" : "≤"} ${filters.maxRuntime} min`);
  if (filters.minSeasons || filters.maxSeasons) reasons.push(`seasons: ${filters.minSeasons || 1}${filters.maxSeasons ? `–${filters.maxSeasons}` : "+"}`);
  return reasons.length ? `Matches ${reasons.join(" · ")}.` : "Selected from your discovery search.";
}

export async function discoverPage({ filters, keyword, page, movieGenres, tvGenres }) {
  const types = filters.contentType === "all" ? ["movie", "tv"] : [filters.contentType];
  let totalResults = 0;
  let totalPages = 1;
  let items = [];

  if (keyword) {
    const params = { query: keyword, include_adult: "false", language: "en-US", page: String(page) };
    if (filters.region) params.region = filters.region;
    const response = await tmdb("search/multi", params);
    totalResults = Number(response.total_results) || 0;
    totalPages = Number(response.total_pages) || 1;
    items = dedupeByMedia(response.results || []).filter(item => types.includes(item.media_type));
  } else {
    const responses = await Promise.all(types.map(async type => {
      const useTrending = type === "tv" && filters.tvSource === "trending" && !filters.region;
      const params = { language: "en-US", page: String(page), sort_by: sortParam(filters.sortBy, type), include_adult: "false" };
      const ids = genreIds(type, filters.genres, movieGenres, tvGenres);
      if (ids.length) params.with_genres = ids.join("|");
      if (filters.yearFrom) params[type === "tv" ? "first_air_date.gte" : "primary_release_date.gte"] = `${filters.yearFrom}-01-01`;
      if (filters.yearTo) params[type === "tv" ? "first_air_date.lte" : "primary_release_date.lte"] = `${filters.yearTo}-12-31`;
      if (filters.minRating !== "") params["vote_average.gte"] = String(filters.minRating);
      if (filters.maxRating !== "") params["vote_average.lte"] = String(filters.maxRating);
      if (filters.language) params.with_original_language = filters.language;
      if (filters.region) params.region = filters.region;
      if (filters.providerId && type === "movie") {
        params.watch_region = "IN";
        params.with_watch_providers = filters.providerId;
        params.with_watch_monetization_types = "flatrate";
      }
      const response = useTrending
        ? await tmdb("trending/tv/week", { language: "en-US", page: String(page) })
        : await tmdb("discover/" + type, params);
      return { type, response };
    }));
    for (const { type, response } of responses) {
      totalResults += Number(response.total_results) || 0;
      totalPages = Math.max(totalPages, Number(response.total_pages) || 1);
      items.push(...(response.results || []).map(item => ({ ...item, media_type: type })));
    }
  }

  items = basicFilter(dedupeByMedia(items), filters, movieGenres, tvGenres);
  if (filters.providerId && keyword) {
    const movies = items.filter(item => item.media_type === "movie");
    const availability = await Promise.all(movies.map(async item => {
      try {
        const data = await tmdb(`movie/${item.id}/watch/providers`);
        return (data?.results?.IN?.flatrate || []).some(provider => Number(provider.provider_id) === Number(filters.providerId));
      } catch { return false; }
    }));
    const allowedIds = new Set(movies.filter((_, index) => availability[index]).map(item => item.id));
    items = items.filter(item => item.media_type !== "movie" || allowedIds.has(item.id));
  }

  const needsRuntime = filters.maxRuntime !== "";
  const needsSeasons = filters.minSeasons !== "" || filters.maxSeasons !== "";
  if (needsRuntime || needsSeasons) {
    items = await fetchRuntimeDetails(items);
    items = items.filter(item => {
      if (needsRuntime && (item.runtime_minutes == null || (filters.runtimeExclusive ? item.runtime_minutes >= Number(filters.maxRuntime) : item.runtime_minutes > Number(filters.maxRuntime)))) return false;
      if (needsSeasons && (item.media_type !== "tv" || item.number_of_seasons == null)) return false;
      if (filters.minSeasons !== "" && item.number_of_seasons < Number(filters.minSeasons)) return false;
      if (filters.maxSeasons !== "" && item.number_of_seasons > Number(filters.maxSeasons)) return false;
      return true;
    });
  }

  const effectiveSort = !keyword && filters.sortBy === "relevance" ? "popularity" : filters.sortBy;
  items = sortItems(items, effectiveSort).map(item => ({ ...item, discovery_reason: explainMatch(item, filters) }));
  return { items, totalResults, totalPages, page, hasMore: page < totalPages };
}
