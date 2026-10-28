import { useEffect, useMemo, useRef, useState } from "react";
import AccountModals from "../components/AccountModals";
import DetailsModal from "../components/DetailsModal";
import MovieCard from "../components/MovieCard";
import Navbar from "../components/Navbar";
import TrailerModal from "../components/TrailerModal";
import { dedupeByMedia, tmdb } from "../services/tmdb";
import { hasTitle, LIKES_KEY, readStoredList, toggleStoredTitle, WATCHLIST_KEY, writeStoredList } from "../services/storage";

const MOODS = [
  { id: "feel-good", label: "Happy & Feel-Good", keyword: "feel-good", movie: ["Comedy", "Family", "Animation"], tv: ["Comedy", "Family", "Animation"] },
  { id: "emotional", label: "Emotional & Heartwarming", keyword: "heartwarming", movie: ["Drama", "Romance"], tv: ["Drama", "Romance"] },
  { id: "thrilling", label: "Thriller & Suspense", keyword: "suspense", movie: ["Thriller", "Mystery", "Crime"], tv: ["Mystery", "Crime", "Drama"] },
  { id: "scary", label: "Horror", keyword: "horror", movie: ["Horror", "Mystery", "Thriller"], tv: ["Mystery", "Crime"] },
  { id: "romantic", label: "Romance", keyword: "romance", movie: ["Romance", "Drama"], tv: ["Drama", "Family"] },
  { id: "mind-bending", label: "Mind-Bending", keyword: "mind-bending", movie: ["Science Fiction", "Mystery", "Thriller"], tv: ["Sci-Fi & Fantasy", "Mystery"] },
  { id: "action", label: "Action & Adventure", keyword: "adventure", movie: ["Action", "Adventure"], tv: ["Action & Adventure", "Sci-Fi & Fantasy"] },
  { id: "relaxing", label: "Relaxing & Peaceful", keyword: "feel-good", movie: ["Family", "Comedy", "Documentary"], tv: ["Family", "Comedy", "Documentary"] },
  { id: "sci-fi", label: "Sci-Fi & Futuristic", keyword: "space", movie: ["Science Fiction", "Adventure"], tv: ["Sci-Fi & Fantasy"] },
  { id: "family", label: "Family Time", keyword: "family", movie: ["Family", "Animation", "Adventure"], tv: ["Family", "Animation", "Kids"] },
];
const WINDOWS = [
  { id: "20-30", label: "20-30 minutes", min: 20, max: 30 },
  { id: "30-60", label: "30-60 minutes", min: 30, max: 60 },
  { id: "60-120", label: "1-2 hours", min: 60, max: 120 },
  { id: "120-plus", label: "2+ hours", min: 120, max: Infinity },
];
const PREFS_KEY = "cinefind_recommendation_preferences_v71";
const FEEDBACK_KEY = "cinefind_recommendation_feedback_v71";
const defaultPrefs = { mediaType: "both", movieGenres: [], tvGenres: [], favoriteMoods: [], duration: "any", includeWatchlistTitles: false };

function readJson(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value ?? fallback; }
  catch { return fallback; }
}

async function getRuntime(item) {
  try {
    const type = item.media_type;
    const details = await tmdb(`${type}/${item.id}`, { language: "en-US" });
    if (type === "movie") return Number(details.runtime) || null;
    const direct = Number((details.episode_run_time || [])[0]);
    if (direct > 0) return direct;
    const season = (details.seasons || []).find(entry => entry.season_number > 0);
    if (!season) return null;
    const episodes = await tmdb(`tv/${item.id}/season/${season.season_number}`, { language: "en-US" });
    const runtimes = (episodes.episodes || []).map(episode => Number(episode.runtime)).filter(value => value > 0);
    return runtimes.length ? Math.round(runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length) : null;
  } catch { return null; }
}

export default function MoodPage() {
  const [watchlist, setWatchlist] = useState(() => readStoredList(WATCHLIST_KEY));
  const [likes, setLikes] = useState(() => readStoredList(LIKES_KEY));
  const [prefs, setPrefs] = useState(() => ({ ...defaultPrefs, ...readJson(PREFS_KEY, {}) }));
  const [feedback, setFeedback] = useState(() => readJson(FEEDBACK_KEY, []));
  const [movieGenres, setMovieGenres] = useState([]);
  const [tvGenres, setTvGenres] = useState([]);
  const [selectedMood, setSelectedMood] = useState(prefs.favoriteMoods[0] || "");
  const [timeWindow, setTimeWindow] = useState("30-60");
  const [moodResults, setMoodResults] = useState([]);
  const [personalResults, setPersonalResults] = useState([]);
  const [loadingMood, setLoadingMood] = useState(false);
  const [loadingPersonal, setLoadingPersonal] = useState(false);
  const [status, setStatus] = useState("Choose a mood to discover something to watch.");
  const [personalStatus, setPersonalStatus] = useState("Building suggestions from popular titles.");
  const [detailItem, setDetailItem] = useState(null);
  const [trailerKey, setTrailerKey] = useState("");
  const [accountMode, setAccountMode] = useState("");
  const [surpriseId, setSurpriseId] = useState(null);
  const moodSequence = useRef(0);
  const personalSequence = useRef(0);

  useEffect(() => { writeStoredList(WATCHLIST_KEY, watchlist); }, [watchlist]);
  useEffect(() => { writeStoredList(LIKES_KEY, likes); }, [likes]);
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} }, [prefs]);
  useEffect(() => { try { localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedback)); } catch {} }, [feedback]);
  useEffect(() => {
    let live = true;
    Promise.all([tmdb("genre/movie/list"), tmdb("genre/tv/list")]).then(([movie, tv]) => {
      if (live) { setMovieGenres(movie.genres || []); setTvGenres(tv.genres || []); }
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  const toggleWatchlist = item => setWatchlist(current => toggleStoredTitle(current, item, item.media_type));
  const toggleLike = item => setLikes(current => toggleStoredTitle(current, item, item.media_type));
  const isSaved = item => hasTitle(watchlist, item, item.media_type);
  const isLiked = item => hasTitle(likes, item, item.media_type);

  async function chooseMood(moodId) {
    const mood = MOODS.find(entry => entry.id === moodId);
    if (!mood) return;
    const requestId = ++moodSequence.current;
    setSelectedMood(moodId);
    setPrefs(current => ({ ...current, favoriteMoods: [moodId] }));
    setLoadingMood(true); setStatus(`Finding ${mood.label.toLowerCase()} titles...`);
    try {
      const keywordData = await tmdb("search/keyword", { query: mood.keyword, page: "1" });
      const exact = (keywordData.results || []).find(entry => entry.name.toLowerCase() === mood.keyword.toLowerCase());
      const keywordIds = exact ? [exact.id] : (keywordData.results || []).slice(0, 1).map(entry => entry.id);
      const makeParams = (type, genres) => {
        const available = type === "tv" ? tvGenres : movieGenres;
        const wanted = new Set(genres.map(name => name.toLowerCase()));
        const ids = available.filter(entry => wanted.has(entry.name.toLowerCase())).map(entry => entry.id);
        return { language: "en-US", page: "1", sort_by: "popularity.desc", include_adult: "false", ...(ids.length ? { with_genres: ids.join("|") } : {}), ...(keywordIds.length ? { with_keywords: keywordIds.join("|") } : {}) };
      };
      const [movies, shows] = await Promise.all([
        tmdb("discover/movie", makeParams("movie", mood.movie)),
        tmdb("discover/tv", makeParams("tv", mood.tv)),
      ]);
      if (requestId !== moodSequence.current) return;
      let items = dedupeByMedia([...(movies.results || []).slice(0, 12).map(item => ({ ...item, media_type: "movie" })), ...(shows.results || []).slice(0, 12).map(item => ({ ...item, media_type: "tv" }))]);
      const runtimeResults = await Promise.all(items.map(async item => ({ ...item, runtime_minutes: await getRuntime(item) })));
      if (requestId !== moodSequence.current) return;
      setMoodResults(runtimeResults);
      setStatus(runtimeResults.length ? `Mood: ${mood.label}. Choose a viewing window for ranked suggestions.` : "No matching titles were found for this mood.");
    } catch {
      if (requestId === moodSequence.current) { setMoodResults([]); setStatus("Mood picks could not be loaded. Check that the backend and TMDB connection are running."); }
    } finally {
      if (requestId === moodSequence.current) setLoadingMood(false);
    }
  }

  const moodWindow = WINDOWS.find(entry => entry.id === timeWindow);
  const rankedMoodResults = useMemo(() => {
    if (!moodWindow) return moodResults;
    return [...moodResults].sort((a, b) => {
      const inA = a.runtime_minutes >= moodWindow.min && a.runtime_minutes <= moodWindow.max;
      const inB = b.runtime_minutes >= moodWindow.min && b.runtime_minutes <= moodWindow.max;
      return Number(inB) - Number(inA) || Number(b.vote_average || 0) - Number(a.vote_average || 0);
    });
  }, [moodResults, moodWindow]);

  async function runPersonalRecommendations() {
    const requestId = ++personalSequence.current;
    setLoadingPersonal(true); setPersonalStatus("Building recommendations from your preferences...");
    try {
      const savedGenreLists = await Promise.all(watchlist.slice(0, 3).map(async saved => {
        if (Array.isArray(saved.genre_ids) && saved.genre_ids.length) return saved.genre_ids;
        try {
          const details = await tmdb(`${saved.media_type}/${saved.id}`, { language: "en-US" });
          return (details.genres || []).map(genre => genre.id);
        } catch { return []; }
      }));
      const watchlistGenres = new Set(savedGenreLists.flat().map(Number));
      const types = prefs.mediaType === "both" ? ["movie", "tv"] : [prefs.mediaType];
      const lists = await Promise.all(types.map(async type => {
        const chosen = type === "tv" ? prefs.tvGenres : prefs.movieGenres;
        const mood = MOODS.find(entry => entry.id === (selectedMood || prefs.favoriteMoods[0]));
        const available = type === "tv" ? tvGenres : movieGenres;
        const moodNames = mood ? (type === "tv" ? mood.tv : mood.movie) : [];
        const wanted = new Set([...chosen, ...available.filter(item => moodNames.includes(item.name)).map(item => item.id), ...[...watchlistGenres].filter(id => available.some(genre => Number(genre.id) === id))].map(Number));
        const path = wanted.size ? `discover/${type}` : `${type}/popular`;
        const params = wanted.size ? { with_genres: [...wanted].join("|"), sort_by: "popularity.desc", page: "1", language: "en-US" } : { page: "1", language: "en-US" };
        const data = await tmdb(path, params);
        return (data.results || []).slice(0, 12).map(item => ({ ...item, media_type: type }));
      }));
      if (requestId !== personalSequence.current) return;
      let items = dedupeByMedia(lists.flat());
      const preferredWindow = WINDOWS.find(window => window.id === prefs.duration);
      if (preferredWindow) {
        items = await Promise.all(items.slice(0, 24).map(async item => ({ ...item, runtime_minutes: await getRuntime(item) })));
        items = items.filter(item => item.runtime_minutes != null && item.runtime_minutes >= preferredWindow.min && item.runtime_minutes <= preferredWindow.max);
      }
      const savedKeys = new Set(watchlist.map(item => `${item.media_type}:${item.id}`));
      if (!prefs.includeWatchlistTitles) items = items.filter(item => !savedKeys.has(`${item.media_type}:${item.id}`));
      const excluded = new Set(feedback.filter(entry => entry.choice === "less").map(entry => `${entry.mediaType}:${entry.id}`));
      items = items.filter(item => !excluded.has(`${item.media_type}:${item.id}`));
      const moreGenres = new Set(feedback.filter(entry => entry.choice === "more").flatMap(entry => entry.genreIds || []).map(Number));
      const score = item => Number(item.vote_average || 0) + (item.genre_ids || []).filter(id => watchlistGenres.has(Number(id)) || moreGenres.has(Number(id))).length * 0.6;
      items.sort((a, b) => score(b) - score(a));
      const withReasons = items.slice(0, 8).map(item => ({ ...item, recommendation_reason: item.genre_ids?.length ? "Selected using your genre and mood preferences." : "Popular pick to help you get started." }));
      setPersonalResults(withReasons);
      setPersonalStatus(withReasons.length ? "Suggestions are ready. Your preferences stay in this browser." : "No matching suggestions; try clearing some filters.");
    } catch {
      if (requestId === personalSequence.current) { setPersonalResults([]); setPersonalStatus("Recommendations are unavailable right now."); }
    } finally {
      if (requestId === personalSequence.current) setLoadingPersonal(false);
    }
  }

  useEffect(() => { runPersonalRecommendations(); }, [prefs, watchlist, feedback, selectedMood]);

  function updatePrefs(change) {
    setPrefs(current => ({ ...current, ...change }));
  }
  function toggleGenre(type, id) {
    const key = type === "tv" ? "tvGenres" : "movieGenres";
    updatePrefs({ [key]: prefs[key].includes(id) ? prefs[key].filter(value => value !== id) : [...prefs[key], id] });
  }
  function handleFeedback(item, choice) {
    setFeedback(current => [...current.filter(entry => !(entry.id === item.id && entry.mediaType === item.media_type)), { id: item.id, mediaType: item.media_type, choice, genreIds: item.genre_ids || [] }]);
    if (choice === "less") setPersonalResults(current => current.filter(entry => !(entry.id === item.id && entry.media_type === item.media_type)));
  }
  function clearMood() { setSelectedMood(""); setMoodResults([]); setStatus("Select a mood above, then choose your viewing window."); }
  function surpriseMe() {
    if (!rankedMoodResults.length) return;
    const pick = rankedMoodResults[Math.floor(Math.random() * rankedMoodResults.length)];
    setSurpriseId(`${pick.media_type}:${pick.id}`);
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar mode="movie" watchlistCount={watchlist.length} likesCount={likes.length} onSelectMedia={type => window.location.assign(`./index.html?media=${type}`)} onSelectView={view => window.location.assign(`./index.html?view=${view}`)} onLogin={() => setAccountMode("login")} onSignup={() => setAccountMode("signup")} />
      <main className="mood-page">
        <header className="mood-page-header">
          <p className="mood-eyebrow">CINEFIND · PERSONAL PICKS</p>
          <h1>What Are You in the Mood For?</h1>
          <p>Choose your mood, pick your available time, and discover something great to watch.</p>
          <p className="mood-method-note">Picks use TMDB genres, keywords, and available details; they are not exact emotional mood scores.</p>
        </header>

        <section className="personal-recommendations-section">
          <div className="mood-section-title-row">
            <div><p className="mood-eyebrow">CINEFIND · RULE-BASED PICKS</p><h2>Recommended For You</h2><p>Discover movies and series selected to match your interests.</p></div>
            <button type="button" className="mood-primary-button" onClick={runPersonalRecommendations}>Refresh recommendations</button>
          </div>
          <p className="recommendation-privacy-note">Recommendations use selected moods, preferences, and Watchlist titles. Preferences and feedback stay in this browser. TV viewing time refers to an episode.</p>
          <h3 className="preferences-subheading">Your Preferences</h3>
          <div className="personal-recommendation-controls">
            <label className="recommendation-control">Show me<select value={prefs.mediaType} onChange={event => updatePrefs({ mediaType: event.target.value })}><option value="both">Movies & TV Series</option><option value="movie">Movies</option><option value="tv">TV Series</option></select></label>
            <label className="recommendation-control">Preferred viewing time<select value={prefs.duration} onChange={event => updatePrefs({ duration: event.target.value })}><option value="any">Any duration</option>{WINDOWS.map(window => <option key={window.id} value={window.id}>{window.label}</option>)}</select></label>
            <label className="recommendation-toggle"><input type="checkbox" checked={prefs.includeWatchlistTitles} onChange={event => updatePrefs({ includeWatchlistTitles: event.target.checked })} /> Include titles already in my Watchlist</label>
          </div>
          <div className="recommendation-genre-controls">
            <fieldset><legend>Favorite movie genres</legend><div className="favorite-genre-options">{movieGenres.map(genre => <label className="favorite-genre-option" key={genre.id}><input type="checkbox" checked={prefs.movieGenres.includes(genre.id)} onChange={() => toggleGenre("movie", genre.id)} />{genre.name}</label>)}</div></fieldset>
            <fieldset><legend>Favorite TV genres</legend><div className="favorite-genre-options">{tvGenres.map(genre => <label className="favorite-genre-option" key={genre.id}><input type="checkbox" checked={prefs.tvGenres.includes(genre.id)} onChange={() => toggleGenre("tv", genre.id)} />{genre.name}</label>)}</div></fieldset>
          </div>
          <div className="recommendation-preference-actions">
            <button type="button" className="mood-quiet-button" onClick={() => { updatePrefs(defaultPrefs); setSelectedMood(""); }}>Clear preferences</button>
            <button type="button" className="mood-quiet-button" onClick={() => { setFeedback([]); try { localStorage.removeItem(FEEDBACK_KEY); } catch {} }}>Clear feedback history</button>
            <span className="mood-live-status" aria-live="polite">{loadingPersonal ? "Loading..." : personalStatus}</span>
          </div>
          <div className="mood-result-grid">
            {personalResults.map(item => <article className="mood-result-card recommendation-card" key={`${item.media_type}:${item.id}`}>
              <MovieCard item={item} compact isLiked={isLiked(item)} isSaved={isSaved(item)} onOpen={setDetailItem} onToggleLike={toggleLike} onToggleWatchlist={toggleWatchlist} />
              <div className="mood-result-info"><p className="mood-recommendation-reason">{item.recommendation_reason}</p><div className="recommendation-feedback"><button type="button" className="mood-quiet-button feedback-button" onClick={() => handleFeedback(item, "more")}>More Like This</button><button type="button" className="mood-quiet-button feedback-button" onClick={() => handleFeedback(item, "less")}>Not Interested</button></div></div>
            </article>)}
            {!personalResults.length && !loadingPersonal && <p className="mood-placeholder">{personalStatus}</p>}
          </div>
        </section>

        <section className="mood-picker-section">
          <div className="mood-section-title-row"><div><p className="mood-eyebrow">MOOD DISCOVERY</p><h2>Choose a feeling</h2><p>Pick one mood to start a new discovery.</p></div><button type="button" className="mood-quiet-button" onClick={clearMood}>Clear mood</button></div>
          <div className="mood-cards grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {MOODS.map((mood, index) => <button type="button" className={`mood-card ${selectedMood === mood.id ? "is-selected" : ""}`} key={mood.id} aria-pressed={selectedMood === mood.id} onClick={() => chooseMood(mood.id)}><span className="mood-emoji" aria-hidden="true">{["😊","💛","🕵️","👻","💞","🌀","⚔️","🌿","🚀","👨‍👩‍👧"][index]}</span><span>{mood.label}</span></button>)}
          </div>
        </section>

        <section className="watch-time-section">
          <div className="mood-section-title-row"><div><p className="mood-eyebrow">MOOD + VIEWING TIME</p><h2>How Much Time Do You Have?</h2><p aria-live="polite">{loadingMood ? "Loading mood picks..." : status}</p></div><div className="watch-time-actions"><button type="button" className="mood-primary-button" onClick={surpriseMe}>Surprise Me</button><button type="button" className="mood-quiet-button" onClick={() => { setTimeWindow("30-60"); clearMood(); }}>Reset</button></div></div>
          <div className="duration-options flex flex-wrap gap-2" aria-label="Available viewing time">{WINDOWS.map(window => <button type="button" className={`duration-button ${timeWindow === window.id ? "is-selected" : ""}`} key={window.id} aria-pressed={timeWindow === window.id} onClick={() => setTimeWindow(window.id)}>{window.label}</button>)}</div>
          <p className="recommendation-explainer">Short windows favor shorter movies and TV episodes. Unknown runtimes are never guessed.</p>
          <div className="mood-result-grid" aria-live="polite">
            {rankedMoodResults.map(item => <div key={`${item.media_type}:${item.id}`} className={surpriseId === `${item.media_type}:${item.id}` ? "recommendation-card is-surprise" : ""}><MovieCard item={item} isLiked={isLiked(item)} isSaved={isSaved(item)} onOpen={setDetailItem} onToggleLike={toggleLike} onToggleWatchlist={toggleWatchlist} /><p className="mood-runtime-label">{item.runtime_minutes ? `${item.runtime_minutes} minute runtime` : "Runtime unavailable"}</p></div>)}
            {!rankedMoodResults.length && !loadingMood && <p className="mood-placeholder">Choose a mood to get recommendations for your available time.</p>}
          </div>
        </section>
      </main>
      <footer className="mood-page-footer">CineFind mood suggestions use TMDB genre, keyword, and runtime metadata.</footer>
      <AccountModals mode={accountMode} onClose={() => setAccountMode("")} onSwitch={setAccountMode} />
      <DetailsModal item={detailItem} onClose={() => setDetailItem(null)} onOpen={setDetailItem} isSaved={isSaved} isLiked={isLiked} onToggleWatchlist={toggleWatchlist} onToggleLike={toggleLike} onTrailer={setTrailerKey} />
      <TrailerModal videoKey={trailerKey} onClose={() => setTrailerKey("")} />
    </div>
  );
}
