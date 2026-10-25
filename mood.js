/*
 * Mood Discovery uses TMDB's shared configuration and fetch helper from script.js.
 * Genre and keyword matches are useful signals, not emotional mood scores.
 */
const moodDefinitions = {
    "feel-good": { label: "Happy & Feel-Good", keyword: "feel-good", movieGenres: ["Comedy", "Family", "Animation"], tvGenres: ["Comedy", "Family", "Animation"] },
    emotional: { label: "Emotional & Heartwarming", keyword: "heartwarming", movieGenres: ["Drama", "Romance"], tvGenres: ["Drama", "Romance"] },
    thrilling: { label: "Thriller & Suspense", keyword: "suspense", movieGenres: ["Thriller", "Mystery", "Crime"], tvGenres: ["Mystery", "Crime", "Drama"] },
    scary: { label: "Horror", keyword: "horror", movieGenres: ["Horror", "Mystery", "Thriller"], tvGenres: ["Mystery", "Crime"] },
    romantic: { label: "Romance", keyword: "romance", movieGenres: ["Romance", "Drama"], tvGenres: ["Drama", "Family"] },
    "mind-bending": { label: "Mind-Bending", keyword: "mind-bending", movieGenres: ["Science Fiction", "Mystery", "Thriller"], tvGenres: ["Sci-Fi & Fantasy", "Mystery"] },
    action: { label: "Action & Adventure", keyword: "adventure", movieGenres: ["Action", "Adventure"], tvGenres: ["Action & Adventure", "Sci-Fi & Fantasy"] },
    relaxing: { label: "Relaxing & Peaceful", keyword: "feel-good", movieGenres: ["Family", "Comedy", "Documentary"], tvGenres: ["Family", "Comedy", "Documentary"] },
    "sci-fi": { label: "Sci-Fi & Futuristic", keyword: "space", movieGenres: ["Science Fiction", "Adventure"], tvGenres: ["Sci-Fi & Fantasy"] },
    family: { label: "Family Time", keyword: "family", movieGenres: ["Family", "Animation", "Adventure"], tvGenres: ["Family", "Animation", "Kids"] }
};

const timeWindows = {
    "20-30": { label: "20–30 minutes", min: 20, max: 30 },
    "30-60": { label: "30–60 minutes", min: 30, max: 60 },
    "60-120": { label: "1–2 hours", min: 60, max: 120 },
    "120-plus": { label: "2+ hours", min: 120, max: Infinity }
};

let activeMoodId = null;
let activeTimeWindow = "30-60";
let moodRequestId = 0;
let recommendationRequestId = 0;
let moodKeywordCache = new Map();
let moodResults = [];
let recommendationCandidates = [];

function moodGenreIds(mediaType, mood) {
    const genres = mediaType === "tv" ? availableTVGenres : availableMovieGenres;
    const wantedNames = new Set((mediaType === "tv" ? mood.tvGenres : mood.movieGenres).map(name => name.toLowerCase()));
    return genres.filter(genre => wantedNames.has(String(genre.name).toLowerCase())).map(genre => genre.id);
}

function buildMoodDiscoverUrl(mediaType, genreIds, keywordIds) {
    if (!genreIds.length && !keywordIds.length) return null;
    const params = new URLSearchParams({
        language: "en-US",
        page: "1",
        sort_by: "popularity.desc",
        include_adult: "false",
        ...(genreIds.length ? { with_genres: genreIds.join("|") } : {}),
        ...(keywordIds.length ? { with_keywords: keywordIds.join("|") } : {})
    });
    return `${API_BASE_URL}/discover/${mediaType}?${params}`;
}

async function getMoodKeywordIds(mood) {
    if (!mood.keyword) return [];
    if (moodKeywordCache.has(mood.keyword)) return moodKeywordCache.get(mood.keyword);
    try {
        const params = new URLSearchParams({ query: mood.keyword, page: "1" });
        const data = await tmdbFetch(`${API_BASE_URL}/search/keyword?${params}`);
        const matches = Array.isArray(data.results) ? data.results : [];
        const exact = matches.find(item => String(item.name).toLowerCase() === mood.keyword.toLowerCase());
        const ids = (exact ? [exact] : matches.slice(0, 1)).map(item => item.id).filter(Boolean);
        moodKeywordCache.set(mood.keyword, ids);
        return ids;
    } catch (error) {
        moodKeywordCache.set(mood.keyword, []);
        return [];
    }
}

async function chooseMood(moodId) {
    if (!moodDefinitions[moodId]) return;
    activeMoodId = moodId;
    if (typeof personalPreferenceCache !== "undefined") {
        personalPreferenceCache.favoriteMoods = [moodId];
        savePersonalPreferences();
    }
    document.querySelectorAll(".mood-card").forEach(button => {
        button.classList.toggle("is-selected", button.dataset.mood === moodId);
        button.setAttribute("aria-pressed", String(button.dataset.mood === moodId));
    });
    const mood = moodDefinitions[moodId];
    document.getElementById("moodStatus").textContent = `Loading ${mood.label} picks…`;
    document.getElementById("recommendationMoodStatus").textContent = `Mood: ${mood.label}. Choose a time window for ranked suggestions.`;
    await loadMoodResults(moodId);
    if (typeof runPersonalRecommendations === "function") runPersonalRecommendations();
}

async function loadMoodResults(moodId = activeMoodId) {
    if (!moodId) return;
    const requestId = ++moodRequestId;
    const runtimeRequestId = ++recommendationRequestId;
    const resultsContainer = document.getElementById("moodResults");
    const recommendationContainer = document.getElementById("recommendationResults");
    resultsContainer.innerHTML = '<p class="mood-loading">Finding matching movies and TV series…</p>';
    recommendationContainer.innerHTML = '<p class="mood-loading">Checking available runtimes…</p>';
    try {
        await Promise.all([loadMovieGenres(), loadTVGenres()]);
        if (requestId !== moodRequestId || activeMoodId !== moodId) return;
        const mood = moodDefinitions[moodId];
        const keywordIds = await getMoodKeywordIds(mood);
        if (requestId !== moodRequestId || activeMoodId !== moodId) return;
        const movieUrl = buildMoodDiscoverUrl("movie", moodGenreIds("movie", mood), keywordIds);
        const tvUrl = buildMoodDiscoverUrl("tv", moodGenreIds("tv", mood), keywordIds);
        const [movieData, tvData] = await Promise.all([
            movieUrl ? tmdbFetch(movieUrl) : Promise.resolve({ results: [] }),
            tvUrl ? tmdbFetch(tvUrl) : Promise.resolve({ results: [] })
        ]);
        if (requestId !== moodRequestId || activeMoodId !== moodId) return;
        const movies = (Array.isArray(movieData.results) ? movieData.results : []).map(item => ({ ...item, media_type: "movie" }));
        const shows = (Array.isArray(tvData.results) ? tvData.results : []).map(item => ({ ...item, media_type: "tv" }));
        moodResults = dedupeMoodResults(movies.concat(shows));
        renderMoodResults(moodResults, resultsContainer);
        const candidates = movies.slice(0, 5).concat(shows.slice(0, 5));
        if (!candidates.length) {
            recommendationCandidates = [];
            recommendationContainer.innerHTML = '<p class="mood-placeholder">No recommendations are available for this mood right now.</p>';
            return;
        }
        const withRuntimes = await Promise.all(candidates.map(loadRuntimeDetails));
        if (requestId !== moodRequestId || runtimeRequestId !== recommendationRequestId || activeMoodId !== moodId) return;
        recommendationCandidates = withRuntimes;
        renderRecommendations();
        document.getElementById("moodStatus").textContent = `${mood.label}: ${moodResults.length} matching picks.`;
    } catch (error) {
        if (requestId !== moodRequestId || activeMoodId !== moodId) return;
        console.error("Mood discovery error:", error);
        resultsContainer.innerHTML = '<div class="mood-message mood-error"><h3>We could not load these picks</h3><p>Please check your connection and try another mood.</p></div>';
        recommendationContainer.innerHTML = '<p class="mood-placeholder">Time-based recommendations are unavailable right now.</p>';
        document.getElementById("moodStatus").textContent = "Mood picks could not be loaded.";
    }
}

function dedupeMoodResults(items) {
    return Array.from(new Map(items.filter(item => item && item.id).map(item => [`${item.media_type}:${item.id}`, item])).values());
}

function renderMoodResults(items, target) {
    target.replaceChildren();
    if (!items.length) {
        target.innerHTML = '<div class="mood-message"><h3>No matching titles right now</h3><p>Choose another mood to explore more picks.</p></div>';
        return;
    }
    items.forEach(item => target.appendChild(createMoodResultCard(item, false)));
}

function createMoodResultCard(item, isRecommendation) {
    const isTV = item.media_type === "tv";
    const card = document.createElement("article");
    card.className = isRecommendation ? "mood-result-card recommendation-card" : "mood-result-card";
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.dataset.mediaType = isTV ? "tv" : "movie";
    if (isRecommendation) card.dataset.recommendationId = String(item.id);
    const poster = document.createElement("img");
    poster.className = "mood-result-poster";
    poster.src = item.poster_path ? `${IMAGE_URL}${item.poster_path}` : "https://via.placeholder.com/500x750?text=No+Poster";
    poster.alt = item.title || item.name || "Movie or TV series poster";
    poster.loading = "lazy";
    card.appendChild(poster);
    const info = document.createElement("div");
    info.className = "mood-result-info";
    const badge = document.createElement("span");
    badge.className = "media-type-badge";
    badge.textContent = isTV ? "TV Series" : "Movie";
    const title = document.createElement("h3");
    title.textContent = isTV ? item.name || "Unknown Series" : item.title || "Unknown Title";
    const date = document.createElement("p");
    date.className = "mood-result-date";
    date.textContent = `${isTV ? "First aired" : "Released"}: ${(isTV ? item.first_air_date : item.release_date) || "Date unavailable"}`;
    const rating = document.createElement("p");
    rating.className = "mood-result-rating";
    const score = Number(item.vote_average);
    rating.textContent = Number.isFinite(score) && item.vote_average !== null ? `★ ${score.toFixed(1)}` : "Rating unavailable";
    const overview = document.createElement("p");
    overview.className = "mood-result-overview";
    overview.textContent = item.overview || "No description available.";
    info.append(badge, title, date, rating, overview);
    if (isRecommendation) {
        const reason = document.createElement("p");
        reason.className = "mood-recommendation-reason";
        reason.textContent = item._recommendationReason || "Viewing-time fit is unknown.";
        if (item._personalScore === undefined) {
            const runtime = document.createElement("p");
            runtime.className = "mood-runtime-label";
            runtime.textContent = item._runtimeLabel || "Runtime unavailable";
            info.append(runtime);
        }
        info.append(reason);
        if (item._personalScore !== undefined) {
            const feedback = document.createElement("div");
            feedback.className = "recommendation-feedback";
            [["more", "More Like This"], ["less", "Not Interested"]].forEach(([choice, label]) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "mood-quiet-button feedback-button";
                button.textContent = label;
                const saved = personalFeedbackCache.some(entry => entry.id === Number(item.id) && entry.mediaType === item.media_type && entry.choice === choice);
                button.setAttribute("aria-pressed", String(saved));
                if (saved) button.classList.add("is-selected");
                button.addEventListener("click", event => {
                    event.stopPropagation();
                    updatePersonalFeedback(item, choice);
                });
                feedback.appendChild(button);
            });
            info.appendChild(feedback);
        }
    }
    const watchlistButton = createWatchlistCardButton(item, isTV ? "tv" : "movie");
    info.appendChild(watchlistButton);
    info.appendChild(createLikeButton(item, isTV ? "tv" : "movie"));
    card.appendChild(info);
    const openDetails = () => {
        window.location.href = `index.html?media=${isTV ? "tv" : "movie"}&id=${encodeURIComponent(item.id)}`;
    };
    card.addEventListener("click", openDetails);
    card.addEventListener("keydown", event => {
        if (event.key === "Enter") openDetails();
    });
    return card;
}

async function loadRuntimeDetails(item) {
    const isTV = item.media_type === "tv";
    let runtime = null;
    let source = "unknown";
    try {
        if (!isTV) {
            const details = await tmdbFetch(`${API_BASE_URL}/movie/${item.id}?language=en-US`);
            if (Number(details.runtime) > 0 && Number.isFinite(Number(details.runtime))) {
                runtime = Number(details.runtime);
                source = "movie";
            }
        } else {
            const details = await tmdbFetch(`${API_BASE_URL}/tv/${item.id}?language=en-US`);
            const seasons = Array.isArray(details.seasons)
                ? details.seasons.filter(season => Number(season.season_number) > 0 && Number(season.episode_count) !== 0).sort((a, b) => Number(b.season_number) - Number(a.season_number))
                : [];
            if (seasons.length) {
                try {
                    const seasonData = await tmdbFetch(`${API_BASE_URL}/tv/${item.id}/season/${seasons[0].season_number}?language=en-US`);
                    const values = (seasonData.episodes || []).map(episode => Number(episode.runtime)).filter(value => Number.isFinite(value) && value > 0);
                    if (values.length) {
                        runtime = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
                        source = "season";
                    }
                } catch (seasonError) {
                    // Fall back to the series-level typical episode runtime if present.
                }
            }
            if (runtime === null && Array.isArray(details.episode_run_time)) {
                const values = details.episode_run_time.map(Number).filter(value => Number.isFinite(value) && value > 0);
                if (values.length) {
                    runtime = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
                    source = "series";
                }
            }
        }
    } catch (error) {
        // Keep missing runtime unknown; do not create an estimate.
    }
    return { ...item, _runtimeMinutes: runtime, _runtimeSource: source };
}

function scoreRecommendation(item, window) {
    const runtime = item._runtimeMinutes;
    if (!Number.isFinite(runtime)) return -100;
    const isTV = item.media_type === "tv";
    const fits = runtime >= window.min && runtime <= window.max;
    let score;
    if (activeTimeWindow === "20-30") score = fits ? (isTV ? 120 : 110) : -Math.abs(runtime - 25);
    else if (activeTimeWindow === "30-60") score = fits ? (isTV ? 120 : 110) : -Math.abs(runtime - 45);
    else if (activeTimeWindow === "60-120") score = fits ? (isTV ? 45 : 130) : (isTV && runtime < 60 ? 30 : -Math.abs(runtime - 90));
    else score = isTV ? 100 : runtime >= 120 ? 130 : -Math.abs(runtime - 150);
    return score + (Number(item.vote_average) || 0) * 0.5 + Math.log1p(Number(item.popularity) || 0);
}

function recommendationCopy(item, mood, window) {
    const runtime = item._runtimeMinutes;
    if (!Number.isFinite(runtime)) {
        return { _runtimeLabel: "Runtime unavailable", _recommendationReason: `Matches ${mood.label} genres; time fit for ${window.label.toLowerCase()} is unknown.` };
    }
    const isTV = item.media_type === "tv";
    const fits = runtime >= window.min && runtime <= window.max;
    if (isTV) {
        return {
            _runtimeLabel: `Typical episode: about ${runtime} min · series length varies`,
            _recommendationReason: fits
                ? `Matches ${mood.label} genres. One episode is about ${runtime} min; total series time varies.`
                : `Matches ${mood.label} genres. Episode runtime is about ${runtime} min and may not fit this window.`
        };
    }
    return {
        _runtimeLabel: `Movie runtime: ${runtime} min`,
        _recommendationReason: fits
            ? `Matches ${mood.label} genres and its runtime falls within this viewing window.`
            : `Matches ${mood.label} genres, but its runtime is outside this viewing window.`
    };
}

function renderRecommendations() {
    const container = document.getElementById("recommendationResults");
    if (!activeMoodId) {
        container.innerHTML = '<p class="mood-placeholder">Choose a mood to get recommendations for your available time.</p>';
        return;
    }
    if (!recommendationCandidates.length) {
        container.innerHTML = '<p class="mood-placeholder">No recommendations are available for this mood.</p>';
        return;
    }
    const mood = moodDefinitions[activeMoodId];
    const window = timeWindows[activeTimeWindow];
    const ranked = recommendationCandidates
        .map(item => ({ ...item, ...recommendationCopy(item, mood, window), _score: scoreRecommendation(item, window) }))
        .sort((a, b) => b._score - a._score)
        .slice(0, 8);
    container.replaceChildren(...ranked.map(item => createMoodResultCard(item, true)));
}

function chooseTimeWindow(durationId) {
    if (!timeWindows[durationId]) return;
    activeTimeWindow = durationId;
    document.querySelectorAll(".duration-button").forEach(button => button.classList.toggle("is-selected", button.dataset.duration === durationId));
    renderRecommendations();
}

function surpriseMe() {
    const cards = Array.from(document.querySelectorAll("#recommendationResults .recommendation-card"));
    if (!cards.length) return;
    cards.forEach(card => card.classList.remove("is-surprise"));
    const selected = cards[Math.floor(Math.random() * cards.length)];
    selected.classList.add("is-surprise");
    selected.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearSelectedMood() {
    moodRequestId++;
    recommendationRequestId++;
    activeMoodId = null;
    if (typeof personalPreferenceCache !== "undefined") {
        personalPreferenceCache.favoriteMoods = [];
        savePersonalPreferences();
    }
    moodResults = [];
    recommendationCandidates = [];
    document.querySelectorAll(".mood-card").forEach(button => {
        button.classList.remove("is-selected");
        button.setAttribute("aria-pressed", "false");
    });
    document.getElementById("moodStatus").textContent = "Choose a mood to see matching picks.";
    document.getElementById("recommendationMoodStatus").textContent = "Select a mood above, then choose your viewing window.";
    document.getElementById("moodResults").replaceChildren();
    activeTimeWindow = "30-60";
    document.querySelectorAll(".duration-button").forEach(button => button.classList.toggle("is-selected", button.dataset.duration === activeTimeWindow));
    renderRecommendations();
    if (typeof runPersonalRecommendations === "function") runPersonalRecommendations();
}

const moodCards = document.getElementById("moodCards");
moodCards.addEventListener("click", event => {
    const button = event.target.closest("[data-mood]");
    if (button) chooseMood(button.dataset.mood);
});

document.getElementById("durationOptions").addEventListener("click", event => {
    const button = event.target.closest("[data-duration]");
    if (button) chooseTimeWindow(button.dataset.duration);
});
document.getElementById("clearMoodButton").addEventListener("click", clearSelectedMood);
document.getElementById("surpriseMeButton").addEventListener("click", surpriseMe);
document.getElementById("resetRecommendationsButton").addEventListener("click", clearSelectedMood);


/* =========================================================
   PERSONAL RECOMMENDATIONS (Versions 7.0 and 7.1)
   Scores are transparent rules based on TMDB metadata and
   preferences stored only in this browser.
   ========================================================= */
const PERSONAL_PREFS_KEY = "cinefind_recommendation_preferences_v71";
const PERSONAL_FEEDBACK_KEY = "cinefind_recommendation_feedback_v71";
let personalRequestId = 0;
let personalPreferenceRevision = 0;
let personalPreferenceCache = readPersonalPreferences();
let personalFeedbackCache = readPersonalFeedback();
let savedGenreCache = new Map();

function readPersonalPreferences() {
    const fallback = { mediaType: "both", movieGenres: [], tvGenres: [], favoriteMoods: [], duration: "any", includeWatchlistTitles: false };
    try {
        const saved = JSON.parse(localStorage.getItem(PERSONAL_PREFS_KEY) || "null");
        if (!saved || typeof saved !== "object") return fallback;
        return {
            mediaType: ["both", "movie", "tv"].includes(saved.mediaType) ? saved.mediaType : "both",
            movieGenres: Array.isArray(saved.movieGenres) ? saved.movieGenres.map(Number).filter(Number.isSafeInteger) : [],
            tvGenres: Array.isArray(saved.tvGenres) ? saved.tvGenres.map(Number).filter(Number.isSafeInteger) : [],
            favoriteMoods: Array.isArray(saved.favoriteMoods) ? saved.favoriteMoods.filter(id => Boolean(moodDefinitions[id])) : [],
            duration: saved.duration === "any" || Boolean(timeWindows[saved.duration]) ? saved.duration : "any",
            includeWatchlistTitles: saved.includeWatchlistTitles === true
        };
    } catch (error) { return fallback; }
}

function readPersonalFeedback() {
    try {
        const saved = JSON.parse(localStorage.getItem(PERSONAL_FEEDBACK_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        return saved.filter(entry => entry && Number.isSafeInteger(Number(entry.id)) && ["more", "less"].includes(entry.choice) && ["movie", "tv"].includes(entry.mediaType))
            .map(entry => ({ id: Number(entry.id), mediaType: entry.mediaType, choice: entry.choice, genres: Array.isArray(entry.genres) ? entry.genres.map(Number).filter(Number.isSafeInteger) : [] }));
    } catch (error) { return []; }
}

function savePersonalPreferences() {
    personalPreferenceRevision++;
    try { localStorage.setItem(PERSONAL_PREFS_KEY, JSON.stringify(personalPreferenceCache)); } catch (error) {}
    if (window.CineFindDatabase) window.CineFindDatabase.savePreferences(personalPreferenceCache).catch(() => {});
}

function applyDatabasePreferences(remote) {
    if (!remote) return;
    personalPreferenceCache = {
        ...personalPreferenceCache,
        mediaType: ["both", "movie", "tv"].includes(remote.preferred_media_type) ? remote.preferred_media_type : "both",
        movieGenres: Array.isArray(remote.movie_genre_ids) ? remote.movie_genre_ids.map(Number).filter(Number.isSafeInteger) : [],
        tvGenres: Array.isArray(remote.tv_genre_ids) ? remote.tv_genre_ids.map(Number).filter(Number.isSafeInteger) : [],
        favoriteMoods: Array.isArray(remote.favorite_moods) ? remote.favorite_moods.filter(id => Boolean(moodDefinitions[id])) : [],
    };
    activeMoodId = personalPreferenceCache.favoriteMoods[0] || null;
    document.querySelectorAll(".mood-card").forEach(button => {
        const selected = button.dataset.mood === activeMoodId;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
    try { localStorage.setItem(PERSONAL_PREFS_KEY, JSON.stringify(personalPreferenceCache)); } catch (error) {}
}

function savePersonalFeedback() {
    try { localStorage.setItem(PERSONAL_FEEDBACK_KEY, JSON.stringify(personalFeedbackCache)); } catch (error) {}
}

function getMoodGenreIdsForPreference(mediaType) {
    const mood = moodDefinitions[activeMoodId || personalPreferenceCache.favoriteMoods[0]];
    return mood ? moodGenreIds(mediaType, mood) : [];
}

function populateFavoriteGenreChoices(mediaType, targetId) {
    const container = document.getElementById(targetId);
    if (!container) return;
    const genres = mediaType === "tv" ? availableTVGenres : availableMovieGenres;
    if (!genres.length) {
        container.textContent = "Genres are unavailable right now.";
        return;
    }
    const selected = new Set(mediaType === "tv" ? personalPreferenceCache.tvGenres : personalPreferenceCache.movieGenres);
    container.replaceChildren(...genres.map(genre => {
        const label = document.createElement("label");
        label.className = "favorite-genre-option";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = String(genre.id);
        input.checked = selected.has(Number(genre.id));
        input.dataset.genreMedia = mediaType;
        const text = document.createElement("span");
        text.textContent = genre.name;
        label.append(input, text);
        return label;
    }));
}

function syncPersonalControls() {
    document.getElementById("preferredMediaType").value = personalPreferenceCache.mediaType;
    document.getElementById("preferredDuration").value = personalPreferenceCache.duration;
    document.getElementById("includeWatchlistTitles").checked = personalPreferenceCache.includeWatchlistTitles;
    populateFavoriteGenreChoices("movie", "favoriteMovieGenres");
    populateFavoriteGenreChoices("tv", "favoriteTVGenres");
}

function personalDurationBounds(durationId) {
    return durationId === "any" ? null : timeWindows[durationId] || null;
}

function buildPersonalDiscoverUrl(mediaType, genreIds) {
    const bounds = personalDurationBounds(personalPreferenceCache.duration);
    const params = new URLSearchParams({
        language: "en-US", page: "1", sort_by: "popularity.desc", include_adult: "false",
        "vote_count.gte": "20"
    });
    if (genreIds.length) params.set("with_genres", [...new Set(genreIds)].join("|"));
    // Movie runtime and TV episode runtime use separate TMDB filters.
    if (bounds && bounds.max !== Infinity && mediaType === "movie") {
        params.set("with_runtime.gte", String(bounds.min));
        params.set("with_runtime.lte", String(bounds.max));
    } else if (bounds && bounds.max !== Infinity && mediaType === "tv") {
        params.set("with_episode_runtime.gte", String(bounds.min));
        params.set("with_episode_runtime.lte", String(bounds.max));
    } else if (bounds && bounds.max === Infinity && mediaType === "movie") {
        params.set("with_runtime.gte", String(bounds.min));
    }
    return API_BASE_URL + "/discover/" + mediaType + "?" + params;
}

async function getSavedWatchlistGenreIds(mediaType) {
    const savedItems = loadWatchlist().filter(item => item.media_type === mediaType);
    const allGenres = [];
    await Promise.all(savedItems.map(async item => {
        const cacheKey = mediaType + ":" + item.id;
        if (!savedGenreCache.has(cacheKey)) {
            const url = API_BASE_URL + "/" + mediaType + "/" + item.id + "?language=en-US";
            savedGenreCache.set(cacheKey, tmdbFetch(url).then(details => (details.genres || []).map(genre => Number(genre.id)).filter(Number.isSafeInteger)).catch(() => []));
        }
        allGenres.push(...await savedGenreCache.get(cacheKey));
    }));
    return [...new Set(allGenres)];
}

async function getWatchlistSimilarCandidates(mediaType) {
    const savedItems = loadWatchlist().filter(item => item.media_type === mediaType).slice(0, 3);
    const results = await Promise.all(savedItems.map(async item => {
        try {
            const url = API_BASE_URL + "/" + mediaType + "/" + item.id + "/similar?language=en-US&page=1";
            const data = await tmdbFetch(url);
            return (data.results || []).map(result => ({ ...result, media_type: mediaType, _fromSimilar: true }));
        } catch (error) { return []; }
    }));
    return results.flat();
}

function scorePersonalRecommendation(item, context) {
    // Genre, mood, Watchlist, and feedback matches lead the score; ratings
    // are vote-weighted and popularity is only a smaller tie-breaker.
    const ids = new Set(Array.isArray(item.genre_ids) ? item.genre_ids.map(Number) : []);
    let score = 0;
    const reasons = [];
    const favoriteMatches = context.favoriteGenres.filter(id => ids.has(id));
    const moodMatches = context.moodGenres.filter(id => ids.has(id));
    const watchlistMatches = context.watchlistGenres.filter(id => ids.has(id));
    const feedbackMatches = context.feedbackGenres.filter(id => ids.has(id));
    if (favoriteMatches.length) { score += 34 + Math.min(favoriteMatches.length - 1, 2) * 8; reasons.push("Matches your favorite genres."); }
    if (moodMatches.length) { score += 24; reasons.push("Matches your selected " + moodDefinitions[context.moodId].label + " mood."); }
    if (watchlistMatches.length) { score += 32; reasons.push("Shares genres with titles in your Watchlist."); }
    if (item._fromSimilar) { score += 22; reasons.push("Similar to a title in your Watchlist."); }
    if (feedbackMatches.length) { score += 18; reasons.push("Matches genres from titles you asked to see more like."); }
    if (context.durationMatch) { score += 14; reasons.push("Fits your selected viewing time."); }
    if (personalFeedbackCache.some(entry => entry.id === Number(item.id) && entry.mediaType === item.media_type && entry.choice === "more")) {
        score += 100;
        reasons.unshift("You asked to see more like this.");
    }
    const rating = Number(item.vote_average) || 0;
    const votes = Number(item.vote_count) || 0;
    if (rating > 0) score += (rating * Math.min(votes / 100, 1)) * 1.8;
    score += Math.log1p(Math.max(0, Number(item.popularity) || 0)) * 1.5;
    if (!reasons.length) {
        if (rating >= 7 && votes >= 30) reasons.push("Highly rated on TMDB.");
        else reasons.push("A popular pick on TMDB.");
    }
    return { score, reason: reasons.slice(0, 2).join(" ") };
}

function renderPersonalRecommendationCards(items, status) {
    const container = document.getElementById("personalRecommendationResults");
    const statusNode = document.getElementById("personalRecommendationStatus");
    if (statusNode) statusNode.textContent = status;
    container.replaceChildren();
    if (!items.length) {
        container.innerHTML = '<div class="mood-message"><h3>No recommendations found</h3><p>Try another genre, mood, or media type.</p></div>';
        return;
    }
    items.forEach(item => {
        const card = createMoodResultCard(item, true);
        card.dataset.recommendationTarget = "personal";
        container.appendChild(card);
    });
}

async function runPersonalRecommendations() {
    if (!document.querySelector(".recommendation-genre-controls")) return;
    const requestId = ++personalRequestId;
    const container = document.getElementById("personalRecommendationResults");
    container.innerHTML = '<p class="mood-loading">Finding recommendations that fit your preferences…</p>';
    document.getElementById("personalRecommendationStatus").textContent = "Loading personalized picks…";
    try {
        await Promise.all([loadMovieGenres(), loadTVGenres()]);
        const types = personalPreferenceCache.mediaType === "both" ? ["movie", "tv"] : [personalPreferenceCache.mediaType];
        const perType = await Promise.all(types.map(async mediaType => {
            const ownFavorites = mediaType === "tv" ? personalPreferenceCache.tvGenres : personalPreferenceCache.movieGenres;
            const moodGenres = getMoodGenreIdsForPreference(mediaType);
            const watchlistGenres = await getSavedWatchlistGenreIds(mediaType);
            const feedbackGenres = personalFeedbackCache.filter(entry => entry.mediaType === mediaType && entry.choice === "more").flatMap(entry => entry.genres);
            const favoriteGenres = [...new Set(ownFavorites)];
            const queryGenres = [...new Set([...favoriteGenres, ...moodGenres, ...watchlistGenres, ...feedbackGenres])];
            let data;
            if (queryGenres.length || personalPreferenceCache.duration !== "any") {
                data = await tmdbFetch(buildPersonalDiscoverUrl(mediaType, queryGenres));
            } else {
                data = await tmdbFetch(API_BASE_URL + "/" + mediaType + "/popular?language=en-US&page=1");
            }
            let items = (Array.isArray(data.results) ? data.results : []).map(item => ({ ...item, media_type: mediaType }));
            items = items.concat(await getWatchlistSimilarCandidates(mediaType));
            const unique = new Map(items.filter(item => Number.isSafeInteger(Number(item.id))).map(item => [mediaType + ":" + item.id, item]));
            const savedKeys = new Set(loadWatchlist().map(item => item.media_type + ":" + item.id));
            const context = { favoriteGenres, moodGenres, watchlistGenres, feedbackGenres, moodId: activeMoodId || personalPreferenceCache.favoriteMoods[0], durationMatch: personalPreferenceCache.duration !== "any" && (personalPreferenceCache.duration !== "120-plus" || mediaType === "movie") };
            return [...unique.values()]
                .filter(item => !personalFeedbackCache.some(entry => entry.id === Number(item.id) && entry.mediaType === mediaType && entry.choice === "less"))
                .filter(item => personalPreferenceCache.includeWatchlistTitles || !savedKeys.has(mediaType + ":" + item.id))
                .map(item => {
                    const result = scorePersonalRecommendation(item, context);
                    return { ...item, _recommendationReason: result.reason, _personalScore: result.score };
                });
        }));
        if (requestId !== personalRequestId) return;
        const ranked = perType.flat().sort((a, b) => b._personalScore - a._personalScore).slice(0, 12);
        const activeMood = activeMoodId || personalPreferenceCache.favoriteMoods[0];
        const hasPreferences = personalPreferenceCache.movieGenres.length || personalPreferenceCache.tvGenres.length || activeMood || personalPreferenceCache.duration !== "any" || loadWatchlist().length;
        renderPersonalRecommendationCards(ranked, hasPreferences ? "Ranked using your selected preferences and TMDB title data." : "Showing popular TMDB picks. Add preferences to personalize the ranking.");
    } catch (error) {
        if (requestId !== personalRequestId) return;
        container.innerHTML = '<div class="mood-message mood-error"><h3>Recommendations are unavailable</h3><p>Please check your connection and refresh the recommendations.</p></div>';
        document.getElementById("personalRecommendationStatus").textContent = "Could not load recommendations.";
    }
}

function updatePersonalFeedback(item, choice) {
    const mediaType = item.media_type === "tv" ? "tv" : "movie";
    const existing = personalFeedbackCache.find(entry => entry.id === Number(item.id) && entry.mediaType === mediaType);
    if (existing && existing.choice === choice) personalFeedbackCache = personalFeedbackCache.filter(entry => entry !== existing);
    else {
        personalFeedbackCache = personalFeedbackCache.filter(entry => !(entry.id === Number(item.id) && entry.mediaType === mediaType));
        personalFeedbackCache.push({ id: Number(item.id), mediaType, choice, genres: Array.isArray(item.genre_ids) ? item.genre_ids.map(Number).filter(Number.isSafeInteger) : [] });
    }
    savePersonalFeedback();
    runPersonalRecommendations();
}

function clearPersonalPreferences() {
    personalRequestId++;
    personalPreferenceCache = { mediaType: "both", movieGenres: [], tvGenres: [], favoriteMoods: [], duration: "any", includeWatchlistTitles: false };
    activeMoodId = null;
    try { localStorage.removeItem(PERSONAL_PREFS_KEY); } catch (error) {}
    syncPersonalControls();
    clearSelectedMood();
    try { localStorage.removeItem(PERSONAL_PREFS_KEY); } catch (error) {}
    runPersonalRecommendations();
}

function clearPersonalFeedback() {
    personalFeedbackCache = [];
    try { localStorage.removeItem(PERSONAL_FEEDBACK_KEY); } catch (error) {}
    runPersonalRecommendations();
}

function initializePersonalRecommendations() {
    if (!document.querySelector(".recommendation-genre-controls")) return;
    activeMoodId = personalPreferenceCache.favoriteMoods[0] || null;
    if (activeMoodId) document.querySelectorAll(".mood-card").forEach(button => {
        button.classList.toggle("is-selected", button.dataset.mood === activeMoodId);
        button.setAttribute("aria-pressed", String(button.dataset.mood === activeMoodId));
    });
    syncPersonalControls();
    document.getElementById("preferredMediaType").addEventListener("change", event => {
        personalPreferenceCache.mediaType = event.target.value;
        savePersonalPreferences();
        runPersonalRecommendations();
    });
    document.getElementById("preferredDuration").addEventListener("change", event => {
        personalPreferenceCache.duration = event.target.value;
        savePersonalPreferences();
        runPersonalRecommendations();
    });
    document.getElementById("includeWatchlistTitles").addEventListener("change", event => {
        personalPreferenceCache.includeWatchlistTitles = event.target.checked;
        savePersonalPreferences();
        runPersonalRecommendations();
    });
    document.querySelector(".recommendation-genre-controls").addEventListener("change", event => {
        const input = event.target.closest("input[data-genre-media]");
        if (!input) return;
        const key = input.dataset.genreMedia === "tv" ? "tvGenres" : "movieGenres";
        personalPreferenceCache[key] = Array.from(document.querySelectorAll('input[data-genre-media="' + input.dataset.genreMedia + '"]:checked')).map(choice => Number(choice.value));
        savePersonalPreferences();
        runPersonalRecommendations();
    });
    document.getElementById("refreshPersonalRecommendations").addEventListener("click", runPersonalRecommendations);
    document.getElementById("clearRecommendationPreferences").addEventListener("click", clearPersonalPreferences);
    document.getElementById("clearRecommendationFeedback").addEventListener("click", clearPersonalFeedback);
    Promise.all([loadMovieGenres(), loadTVGenres()]).then(async () => {
        if (window.CineFindAccountReady) await window.CineFindAccountReady;
        syncPersonalControls();
        if (window.CineFindDatabase) {
            const revisionAtStart = personalPreferenceRevision;
            try {
                const stored = await window.CineFindDatabase.syncPreferences(personalPreferenceCache);
                if (revisionAtStart === personalPreferenceRevision) {
                    applyDatabasePreferences(stored);
                    syncPersonalControls();
                }
            } catch (error) {}
        }
        runPersonalRecommendations();
    }).catch(() => runPersonalRecommendations());
}

window.addEventListener("cinefind-auth-changed", async event => {
    if (!window.CineFindDatabase) return;
    if (!event.detail || !event.detail.account) {
        personalPreferenceCache = readPersonalPreferences();
        activeMoodId = personalPreferenceCache.favoriteMoods[0] || null;
        syncPersonalControls();
    }
    const revisionAtStart = personalPreferenceRevision;
    try {
        const stored = await window.CineFindDatabase.syncPreferences(personalPreferenceCache);
        if (revisionAtStart === personalPreferenceRevision) {
            applyDatabasePreferences(stored);
            syncPersonalControls();
            runPersonalRecommendations();
        }
    } catch (error) {}
});
initializePersonalRecommendations();