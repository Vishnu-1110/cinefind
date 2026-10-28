import { useEffect, useRef, useState } from "react";
import AccountModals from "../components/AccountModals";
import ContentCarousel from "../components/ContentCarousel";
import DetailsModal from "../components/DetailsModal";
import Navbar from "../components/Navbar";
import OTTPlatformFilter from "../components/OTTPlatformFilter";
import TrailerModal from "../components/TrailerModal";
import { discoverPage, EMPTY_FILTERS, parseNaturalQuery } from "../services/discovery";
import { getProviderCatalog, tmdb } from "../services/tmdb";
import { hasTitle, LIKES_KEY, readStoredList, toggleStoredTitle, WATCHLIST_KEY, writeStoredList } from "../services/storage";

const LANGUAGE_OPTIONS = [
  ["en", "English"], ["hi", "Hindi"], ["te", "Telugu"], ["ta", "Tamil"], ["ml", "Malayalam"],
  ["kn", "Kannada"], ["bn", "Bengali"], ["mr", "Marathi"], ["pa", "Punjabi"], ["ko", "Korean"],
  ["ja", "Japanese"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["zh", "Chinese"],
];
const REGION_OPTIONS = [["IN", "India"], ["US", "United States"], ["GB", "United Kingdom"], ["KR", "South Korea"], ["JP", "Japan"], ["ES", "Spain"], ["FR", "France"]];
const HOME_FEEDS = [
  { key: "trending-movies", title: "Trending Movies", path: "trending/movie/week", type: "movie" },
  { key: "popular-movies", title: "Popular Movies", path: "movie/popular", type: "movie" },
  { key: "trending-tv", title: "Trending TV Shows", path: "trending/tv/week", type: "tv" },
  { key: "popular-tv", title: "Popular TV Shows", path: "tv/popular", type: "tv" },
];

function isDefaultLanding(filters, keyword, view) {
  return view === "browse" && !keyword && filters.contentType === "all" && !filters.genres.length
    && !filters.yearFrom && !filters.yearTo && filters.minRating === "" && filters.maxRating === ""
    && !filters.language && !filters.region && !filters.maxRuntime && !filters.minSeasons && !filters.maxSeasons
    && !filters.providerId && filters.sortBy === "relevance" && filters.tvSource === "popular";
}

function toFrontendFilters(parsed) {
  const source = parsed.filters || {};
  return {
    ...EMPTY_FILTERS,
    contentType: source.content_type || "all",
    genres: source.genres || [],
    yearFrom: source.year_from ?? "", yearTo: source.year_to ?? "",
    minRating: source.min_rating ?? "", ratingExclusive: Boolean(source.rating_exclusive),
    maxRating: source.max_rating ?? "", ratingMaxExclusive: Boolean(source.rating_max_exclusive),
    language: source.language || "", region: source.region || "",
    maxRuntime: source.max_runtime_minutes ?? "", runtimeExclusive: Boolean(source.runtime_exclusive),
    minSeasons: source.min_seasons ?? "", maxSeasons: source.max_seasons ?? "",
    sortBy: source.sort_by || (source.min_rating != null ? "rating" : "relevance"),
  };
}

export default function CatalogPage() {
  const initialMedia = new URLSearchParams(window.location.search).get("media");
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, contentType: ["movie", "tv"].includes(initialMedia) ? initialMedia : "all" }));
  const [queryInput, setQueryInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [movieGenres, setMovieGenres] = useState([]);
  const [tvGenres, setTvGenres] = useState([]);
  const [providers, setProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [homeFeeds, setHomeFeeds] = useState(() => Object.fromEntries(HOME_FEEDS.map(feed => [feed.key, { items: [], loading: true, error: "" }])));
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [parseResult, setParseResult] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [detailsItem, setDetailsItem] = useState(null);
  const [trailerKey, setTrailerKey] = useState("");
  const [accountMode, setAccountMode] = useState("");
  const [view, setView] = useState(() => ["likes", "watchlist"].includes(new URLSearchParams(window.location.search).get("view")) ? new URLSearchParams(window.location.search).get("view") : "browse");
  const [watchlist, setWatchlist] = useState(() => readStoredList(WATCHLIST_KEY));
  const [likes, setLikes] = useState(() => readStoredList(LIKES_KEY));
  const requestNumber = useRef(0);
  const parseSequence = useRef(0);

  useEffect(() => { writeStoredList(WATCHLIST_KEY, watchlist); }, [watchlist]);
  useEffect(() => { writeStoredList(LIKES_KEY, likes); }, [likes]);

  useEffect(() => {
    let alive = true;
    Promise.all([tmdb("genre/movie/list", { language: "en-US" }), tmdb("genre/tv/list", { language: "en-US" })])
      .then(([movies, shows]) => { if (alive) { setMovieGenres(movies.genres || []); setTvGenres(shows.genres || []); } })
      .catch(() => { if (alive) { setMovieGenres([]); setTvGenres([]); } });
    return () => { alive = false; };
  }, []);

  async function loadProviders() {
    setProvidersLoading(true); setProvidersError("");
    try {
      const data = await tmdb("watch/providers/movie", { watch_region: "IN", language: "en-US" });
      setProviders(getProviderCatalog(data));
    } catch {
      setProviders([]); setProvidersError("Platforms could not be loaded.");
    } finally { setProvidersLoading(false); }
  }

  useEffect(() => { loadProviders(); }, []);

  useEffect(() => {
    let alive = true;
    Promise.all(HOME_FEEDS.map(async feed => {
      try {
        const data = await tmdb(feed.path, { language: "en-US", page: "1" });
        return { key: feed.key, items: (data.results || []).map(item => ({ ...item, media_type: feed.type })).slice(0, 20), error: "" };
      } catch {
        return { key: feed.key, items: [], error: "This row could not be loaded. Please try again later." };
      }
    })).then(rows => {
      if (!alive) return;
      setHomeFeeds(Object.fromEntries(rows.map(row => [row.key, { ...row, loading: false }])));
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const requestId = ++requestNumber.current;
    let alive = true;
    if (isDefaultLanding(filters, keyword, view)) {
      setResults([]); setTotalResults(0); setHasMore(false); setError(""); setLoading(false);
      return () => { alive = false; };
    }
    // Search is submitted explicitly; this short delay also coalesces rapid filter edits.
    const timer = window.setTimeout(async () => {
      if (page === 1 && view === "browse") { setResults([]); setTotalResults(0); }
      setLoading(true); setError("");
      try {
        const data = await discoverPage({ filters, keyword, page, movieGenres, tvGenres });
        if (!alive || requestId !== requestNumber.current) return;
        setResults(current => page === 1 ? data.items : [...new Map([...current, ...data.items].map(item => [`${item.media_type}:${item.id}`, item])).values()]);
        setTotalResults(data.totalResults);
        setHasMore(data.hasMore);
      } catch (fetchError) {
        if (!alive || requestId !== requestNumber.current) return;
        setError(fetchError.message || "CineFind could not load titles right now.");
        if (page === 1) setResults([]);
      } finally {
        if (alive && requestId === requestNumber.current) setLoading(false);
      }
    }, 180);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [filters, keyword, page, movieGenres, tvGenres, view]);

  const toggleWatchlist = item => setWatchlist(current => toggleStoredTitle(current, item, item.media_type || "movie"));
  const toggleLike = item => setLikes(current => toggleStoredTitle(current, item, item.media_type || "movie"));
  const isSaved = item => hasTitle(watchlist, item, item.media_type || "movie");
  const isLiked = item => hasTitle(likes, item, item.media_type || "movie");
  const updateFilters = change => {
    parseSequence.current += 1; setParsing(false); setParseResult(null);
    setFilters(current => ({ ...current, ...change })); setPage(1); setView("browse");
  };
  const openMediaType = type => updateFilters({ contentType: type, providerId: type === "tv" ? "" : filters.providerId, genres: [] });
  const toggleGenre = name => updateFilters({ genres: filters.genres.includes(name) ? filters.genres.filter(genre => genre !== name) : [...filters.genres, name] });
  const setViewAndBrowse = next => { setView(next); if (next === "browse") updateFilters({ contentType: "all" }); };

  const startSearch = async event => {
    event?.preventDefault();
    const text = queryInput.trim();
    if (!text) { clearDiscovery(); return; }
    const parseId = ++parseSequence.current;
    setParsing(true); setError(""); setParseResult(null); setView("browse"); setPage(1);
    try {
      const parsed = await parseNaturalQuery(text);
      if (parseId !== parseSequence.current) return;
      setParseResult(parsed);
      if (parsed.recognized_filters?.length) {
        const detected = toFrontendFilters(parsed);
        setFilters(current => ({ ...detected, providerId: detected.contentType === "tv" ? "" : current.providerId }));
      }
      setKeyword(parsed.keyword_query || "");
    } catch {
      if (parseId !== parseSequence.current) return;
      setParseResult({ recognized_filters: [], notices: [], clarification: "Smart filter parsing is unavailable; searching your words as a title or keyword." });
      setKeyword(text);
    } finally { if (parseId === parseSequence.current) setParsing(false); }
  };

  function clearDiscovery() {
    parseSequence.current += 1; setParsing(false);
    setQueryInput(""); setKeyword(""); setParseResult(null); setFilters({ ...EMPTY_FILTERS });
    setPage(1); setHasMore(false); setView("browse");
  }

  const allGenreNames = [...new Set([...movieGenres, ...tvGenres].map(genre => genre.name))].sort((a, b) => a.localeCompare(b));
  const showMovieFilters = filters.contentType !== "tv";
  const showTvFilters = filters.contentType !== "movie";
  const providerName = providers.find(provider => String(provider.provider_id) === String(filters.providerId))?.provider_name;
  const activeLabels = [
    ...(filters.contentType !== "all" ? [filters.contentType === "tv" ? "TV Shows" : "Movies"] : []), ...filters.genres,
    filters.yearFrom || filters.yearTo ? "Year " + (filters.yearFrom || "any") + "–" + (filters.yearTo || "present") : "",
    filters.minRating !== "" ? "Rating " + (filters.ratingExclusive ? ">" : "≥") + " " + filters.minRating : "",
    filters.maxRating !== "" ? "Rating " + (filters.ratingMaxExclusive ? "<" : "≤") + " " + filters.maxRating : "",
    filters.language ? "Language " + filters.language.toUpperCase() : "", filters.region ? "Region " + filters.region : "",
    filters.maxRuntime !== "" ? "Runtime " + (filters.runtimeExclusive ? "<" : "≤") + " " + filters.maxRuntime + " min" : "",
    filters.minSeasons || filters.maxSeasons ? "Seasons " + (filters.minSeasons || "1") + (filters.maxSeasons ? "–" + filters.maxSeasons : "+") : "",
    providerName ? "OTT: " + providerName : "", filters.sortBy !== "relevance" ? "Sort: " + filters.sortBy.replace("_", " ") : "",
  ].filter(Boolean);
  const activeCount = activeLabels.length;
  const visibleItems = view === "watchlist" ? watchlist : view === "likes" ? likes : results;
  const pageTitle = view === "watchlist" ? "My Watchlist" : view === "likes" ? "My Likes" : filters.contentType === "all" ? "Movies & TV Shows" : filters.contentType === "tv" ? "TV Shows" : "Movies";

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar mode={filters.contentType} watchlistCount={watchlist.length} likesCount={likes.length} onSelectMedia={openMediaType} onSelectView={setViewAndBrowse} onLogin={() => setAccountMode("login")} onSignup={() => setAccountMode("signup")} />
      <main>
        <section className="hero">
          <h1>Find Something Great to Watch</h1>
          <p>Search for a title or describe what you feel like watching.</p>
          <form className="search-box" onSubmit={startSearch}>
            <input aria-label="Search or describe what you want to watch" value={queryInput} onChange={event => setQueryInput(event.target.value)} placeholder="Try ‘a funny movie under two hours’..." />
            <button type="submit" disabled={parsing}>{parsing ? "Understanding…" : "Discover"}</button>
          </form>
        </section>

        {view === "browse" && <section className="discovery-panel" aria-label="Discovery filters">
          <div className="discovery-panel-heading"><div><h2>Browse &amp; Filter</h2><p>Choose a platform or open filters to narrow your results.</p></div><div className="discovery-heading-actions"><button type="button" className="mood-quiet-button" aria-expanded={filtersExpanded} onClick={() => setFiltersExpanded(value => !value)}>{filtersExpanded ? "Hide Filters" : "More Filters"}</button><button type="button" className="mood-quiet-button" onClick={clearDiscovery}>Clear all</button></div></div>
          {filtersExpanded && <>
          <div className="discovery-controls">
            <label>Content type<select value={filters.contentType} onChange={event => updateFilters({ contentType: event.target.value, providerId: event.target.value === "tv" ? "" : filters.providerId })}><option value="all">All</option><option value="movie">Movies</option><option value="tv">TV Shows</option></select></label>
            <label>Sort by<select value={filters.sortBy} onChange={event => updateFilters({ sortBy: event.target.value })}><option value="relevance">Relevance</option><option value="rating">Rating</option><option value="popularity">Popularity</option><option value="release_date">Release date</option></select></label>
            <label>Year from<input type="number" min="1870" max="2100" value={filters.yearFrom} onChange={event => updateFilters({ yearFrom: event.target.value })} placeholder="Any" /></label>
            <label>Year to<input type="number" min="1870" max="2100" value={filters.yearTo} onChange={event => updateFilters({ yearTo: event.target.value })} placeholder="Any" /></label>
            <label>Minimum rating<input type="number" min="0" max="10" step="0.1" value={filters.minRating} onChange={event => updateFilters({ minRating: event.target.value })} placeholder="Any" /></label>
            <label>Maximum rating<input type="number" min="0" max="10" step="0.1" value={filters.maxRating} onChange={event => updateFilters({ maxRating: event.target.value })} placeholder="Any" /></label>
            <label>Original language<select value={filters.language} onChange={event => updateFilters({ language: event.target.value })}><option value="">Any language</option>{LANGUAGE_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
            <label>Region<select value={filters.region} onChange={event => updateFilters({ region: event.target.value })}><option value="">Any region</option>{REGION_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
            <label>Maximum runtime (minutes)<input type="number" min="1" max="1000" value={filters.maxRuntime} onChange={event => updateFilters({ maxRuntime: event.target.value })} placeholder="Any" /></label>
            {filters.minRating !== "" && <label>Minimum comparison<select value={filters.ratingExclusive ? "above" : "at-least"} onChange={event => updateFilters({ ratingExclusive: event.target.value === "above" })}><option value="at-least">At least</option><option value="above">Above</option></select></label>}
            {filters.maxRating !== "" && <label>Maximum comparison<select value={filters.ratingMaxExclusive ? "below" : "at-most"} onChange={event => updateFilters({ ratingMaxExclusive: event.target.value === "below" })}><option value="at-most">At most</option><option value="below">Below</option></select></label>}
            {filters.maxRuntime !== "" && <label>Runtime comparison<select value={filters.runtimeExclusive ? "under" : "up-to"} onChange={event => updateFilters({ runtimeExclusive: event.target.value === "under" })}><option value="up-to">Up to</option><option value="under">Under</option></select></label>}
            {showTvFilters && <label>Minimum seasons<input type="number" min="1" max="100" value={filters.minSeasons} onChange={event => updateFilters({ minSeasons: event.target.value, contentType: event.target.value ? "tv" : filters.contentType })} placeholder="Any" /></label>}
            {showTvFilters && <label>Maximum seasons<input type="number" min="1" max="100" value={filters.maxSeasons} onChange={event => updateFilters({ maxSeasons: event.target.value, contentType: event.target.value ? "tv" : filters.contentType })} placeholder="Any" /></label>}
          </div>
          <section className="discovery-genre-list" aria-label="Genre filters"><h3>Genres</h3><div className="genre-buttons flex flex-wrap gap-2">{allGenreNames.map(name => <button type="button" key={name} className={filters.genres.includes(name) ? "is-selected" : ""} aria-pressed={filters.genres.includes(name)} onClick={() => toggleGenre(name)}>{name}</button>)}</div></section>
          {showTvFilters && !keyword && <div className="tv-source-buttons discovery-source"><span>TV source</span><button type="button" className={filters.tvSource !== "trending" ? "is-selected" : ""} onClick={() => updateFilters({ tvSource: "popular" })}>Popular</button><button type="button" className={filters.tvSource === "trending" ? "is-selected" : ""} onClick={() => updateFilters({ tvSource: "trending" })}>Trending this week</button></div>}
          </>}
          {showMovieFilters && <OTTPlatformFilter providers={providers} selectedId={filters.providerId} onSelect={providerId => updateFilters({ providerId })} loading={providersLoading} error={providersError} onRetry={loadProviders} />}
          <div className="discovery-active-row"><span>{activeCount ? activeCount + (activeCount === 1 ? " active filter" : " active filters") : "No filters selected"}</span>{activeLabels.map(label => <span className="discovery-chip" key={label}>{label}</span>)}</div>
        </section>}

        {parseResult && view === "browse" && <section className="intent-summary" aria-live="polite">
          {parseResult.recognized_filters?.length ? <><h2>Detected preferences</h2><div className="intent-chips">{parseResult.recognized_filters.map(item => <span key={item}>{item}</span>)}</div><p>You can adjust these using the filters above.</p></> : <p>{parseResult.clarification}</p>}
          {parseResult.notices?.map(notice => <p className="intent-notice" key={notice}>{notice}</p>)}
        </section>}

        {view === "browse" && isDefaultLanding(filters, keyword, view) ? <div className="catalog-rows" id="catalog">
          {HOME_FEEDS.map(feed => <ContentCarousel key={feed.key} title={feed.title} items={homeFeeds[feed.key].items} loading={homeFeeds[feed.key].loading} error={homeFeeds[feed.key].error} isLiked={isLiked} isSaved={isSaved} onOpen={setDetailsItem} onToggleLike={toggleLike} onToggleWatchlist={toggleWatchlist} />)}
        </div> : view === "browse" ? <section id="catalog" className="catalog-results">
          <div className="catalog-results-title"><div><h2>{pageTitle}{queryInput && !parseResult?.recognized_filters?.length ? ` — “${queryInput}”` : ""}</h2><p className="discovery-result-count">{results.length} titles loaded{totalResults ? ` · ${totalResults.toLocaleString()} source results` : ""}</p></div><button type="button" className="mood-quiet-button" onClick={clearDiscovery}>Clear filters</button></div>
          <ContentCarousel title="Results" items={results} loading={loading} error={error ? `${error} Check that the FastAPI backend is running.` : ""} emptyMessage="No titles match these filters. Try changing a filter or search phrase." isLiked={isLiked} isSaved={isSaved} onOpen={setDetailsItem} onToggleLike={toggleLike} onToggleWatchlist={toggleWatchlist} />
          {(hasMore || loading) && <div className="discovery-load-more">{loading && results.length > 0 && <span aria-live="polite">Loading more titles…</span>}<button type="button" disabled={loading} onClick={() => setPage(current => current + 1)}>Load more</button></div>}
        </section> : <section id="catalog" className="catalog-results">
          <div className="catalog-results-title"><div><h2>{pageTitle}</h2><p className="watchlist-note">{view === "watchlist" ? "Saved in this browser; not synced between devices yet." : "Likes are kept separate from your Watchlist and saved in this browser."}</p></div><button className="mood-quiet-button" type="button" onClick={() => setView("browse")}>Back to browsing</button></div>
          <ContentCarousel title={pageTitle} items={visibleItems} emptyMessage={view === "watchlist" ? "Your Watchlist is empty. Add a title from any card to save it here." : "No Likes yet. Tap Like on a card to save it here."} isLiked={isLiked} isSaved={isSaved} onOpen={setDetailsItem} onToggleLike={toggleLike} onToggleWatchlist={toggleWatchlist} />
        </section>}
      </main>
      <footer className="site-footer p-6 text-center text-sm text-neutral-500">CineFind · Movie and TV discovery powered by TMDB. Streaming data provided by JustWatch where available.</footer>
      <AccountModals mode={accountMode} onClose={() => setAccountMode("")} onSwitch={setAccountMode} />
      <DetailsModal item={detailsItem} onClose={() => setDetailsItem(null)} onOpen={setDetailsItem} isSaved={isSaved} isLiked={isLiked} onToggleWatchlist={toggleWatchlist} onToggleLike={toggleLike} onTrailer={setTrailerKey} />
      <TrailerModal videoKey={trailerKey} onClose={() => setTrailerKey("")} />
    </div>
  );
}
