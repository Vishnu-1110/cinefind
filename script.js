/* =========================================================
   TMDB CONFIGURATION
   ========================================================= */


const API_ROOT = window.CineFindApiRoot || window.location.origin;
const API_BASE_URL = API_ROOT + "/api/tmdb";

const IMAGE_URL =
    "https://image.tmdb.org/t/p/w500";

const BACKDROP_URL =
    "https://image.tmdb.org/t/p/original";

const PROVIDER_IMAGE_URL =
    "https://image.tmdb.org/t/p/w185";


/* =========================================================
   OTT CONFIGURATION
   ========================================================= */

const WATCH_REGION = "IN";


/*
   Stores the movie currently opened
   in the details section.
*/

let currentMovieId = null;
let currentTVId = null;
let detailsRequestId = 0;
let activeMediaType = "movie";
let activeTVGenreId = null;
let activeTVSource = "popular";

// Current movie-list filters. Provider IDs are loaded from TMDB at runtime.
let activeGenre = "All";
let activeOTTProviderId = null;
let movieRequestId = 0;
let availableOTTProviders = [];
let availableMovieGenres = [];
let availableTVGenres = [];
let movieGenreLoadPromise = null;
let tvGenreLoadPromise = null;
const movieWatchAvailabilityCache = new Map();


/*
   Cache OTT information so that we don't
   repeatedly request the same movie.
*/

const watchProviderCache = {};


/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const movieContainer =
    document.getElementById("movieContainer");

const movieDetails =
    document.getElementById("movieDetails");


/* =========================================================
   GENRE IDS
   ========================================================= */

const genreIds = {

    Action: 28,

    Comedy: 35,

    Thriller: 53,

    Romance: 10749,

    "Sci-Fi": 878,

    Horror: 27

};


/* =========================================================
   COMMON TMDB FETCH FUNCTION
   ========================================================= */

async function tmdbFetch(url) {

    const response = await fetch(url, { headers: { accept: "application/json" } });


    if (!response.ok) {
        if (window.CineFindIsGitHubPagesPreview) {
            throw new Error("GitHub Pages is a static preview and does not host the CineFind API. Deploy FastAPI with a database, then open its app address.");
        }
        throw new Error("CineFind API error: " + response.status);
    }
    return await response.json();

}


/* =========================================================
   FETCH MOVIES
   ========================================================= */

async function fetchMovies(url, options = {}) {

    const requestId = ++movieRequestId;
    movieContainer.innerHTML = `
        <p class="loading">Loading movies...</p>
    `;

    try {
        const data = await tmdbFetch(url);
        if (requestId !== movieRequestId) return;

        let movies = Array.isArray(data.results) ? data.results : [];

        // Apply a selected genre to text-search results as well as discovery results.
        if (options.genreId) movies = movies.filter(movie => Array.isArray(movie.genre_ids) && movie.genre_ids.includes(Number(options.genreId)));

        // Discover subscription titles first. If the provider also has free
        // or ad-supported titles, request those separately and merge results.
        if (options.additionalMonetizationTypes) {
            const additionalUrl = new URL(url);
            additionalUrl.searchParams.set(
                "with_watch_monetization_types",
                options.additionalMonetizationTypes
            );

            try {
                const additionalData = await tmdbFetch(additionalUrl.toString());
                if (requestId !== movieRequestId) return;
                if (Array.isArray(additionalData.results)) {
                    movies = movies.concat(additionalData.results);
                }
            }
            catch (additionalError) {
                // Keep subscription results if the optional offer request fails.
                if (movies.length === 0) throw additionalError;
                console.error("Additional streaming offers error:", additionalError);
            }
        }

        if (options.providerId) {
            movieContainer.innerHTML = `
                <p class="loading">Checking India streaming availability...</p>
            `;
            movies = await filterMoviesByProvider(
                movies,
                options.providerId,
                options.genreId,
                requestId
            );
            if (requestId !== movieRequestId) return;
        }

        displayMovies(movies);
    }
    catch (error) {
        if (requestId !== movieRequestId) return;
        console.error("Movie loading error:", error);
        movieContainer.innerHTML = `
            <div class="error-message">
                <h3>⚠️ Movies couldn't be loaded</h3>
                <p>Please check your connection and try again.</p>
            </div>
        `;
    }
}



/* =========================================================
   DISPLAY MOVIES
   ========================================================= */

function displayMovies(movies, mediaType = "movie", target = movieContainer, options = {}) {
    if (!target) return;
    const isMixed = mediaType === "multi";
    const uniqueItems = Array.from(new Map((movies || []).filter(item => item && item.id).map(item => [`${isMixed ? item.media_type : mediaType}:${item.id}`, item])).values());
    target.innerHTML = "";
    if (!uniqueItems.length) {
        const label = options.emptyMessage || (isMixed ? "No movies or TV series found." : mediaType === "tv" ? "No shows found." : "No movies found.");
        target.innerHTML = `<div class="error-message"><h3>😕 ${label}</h3><p>Try another mood or filter.</p></div>`;
        return;
    }
    uniqueItems.forEach(item => {
        const isTV = mediaType === "tv" || (isMixed && item.media_type === "tv");
        const card = document.createElement("div");
        card.className = "movie-card";
        if (options.isRecommendation) card.classList.add("recommendation-card");
        const poster = item.poster_path ? IMAGE_URL + item.poster_path : "https://via.placeholder.com/500x750?text=No+Poster";
        const title = isTV ? (item.name || "Unknown Series") : (item.title || "Unknown Title");
        const releaseDate = isTV ? (item.first_air_date || "Date unavailable") : (item.release_date || "Date unavailable");
        const rating = item.vote_average !== null && item.vote_average !== undefined && Number.isFinite(Number(item.vote_average)) ? Number(item.vote_average).toFixed(1) : "N/A";
        const description = item.overview || "No description available.";
        const mediaLabel = isTV ? "TV Series" : "Movie";
        const runtimeBlock = options.isRecommendation
            ? `<p class="recommendation-runtime">${item._runtimeLabel || "Runtime unavailable"}</p><p class="recommendation-reason">${item._recommendationReason || "Runtime fit is unknown."}</p>`
            : "";
        card.innerHTML = `<img src="${poster}" alt="${title}" loading="lazy"><div class="movie-info"><span class="media-type-badge">${mediaLabel}</span><h3>${title}</h3><p>📅 ${releaseDate}</p><div class="rating">⭐ ${rating}</div><p class="description">${description}</p>${runtimeBlock}</div>`;
        if (options.isRecommendation) {
            card.dataset.recommendationId = String(item.id);
            card.dataset.mediaType = isTV ? "tv" : "movie";
        }
        card.addEventListener("click", () => isTV ? getTVDetails(item.id) : getMovieDetails(item.id));
        const wlBtn = createWatchlistCardButton(item, isTV ? "tv" : "movie");
        const infoDiv = card.querySelector(".movie-info");
        if (infoDiv) {
            infoDiv.appendChild(wlBtn);
            infoDiv.appendChild(createLikeButton(item, isTV ? "tv" : "movie"));
        }
        target.appendChild(card);
    });
}

/* =========================================================
   GENRE AND SEARCH FILTERS
   ========================================================= */

function filterGenre(genre) {

    activeGenre = genreIds[genre] || "All";
    const query = document.getElementById("searchInput");
    if (query && query.value.trim()) searchMovies();
    else loadMovieResults();

}


async function searchMovies() {
    const input = document.getElementById("searchInput");
    const query = input ? input.value.trim() : "";
    if (!query) {
        if (activeMediaType === "tv") loadTVResults();
        else loadMovieResults();
        return;
    }
    await loadUnifiedSearch(query);
}

async function loadUnifiedSearch(query) {
    const requestId = ++movieRequestId;
    const params = new URLSearchParams({ query, language: "en-US", page: "1", include_adult: "false" });
    movieContainer.innerHTML = '<p class="loading">Searching movies and TV series...</p>';
    try {
        const data = await tmdbFetch(`${API_BASE_URL}/search/multi?${params}`);
        if (requestId !== movieRequestId) return;

        // TMDB multi-search also returns people. Keep only movies and TV series,
        // then apply each media type's own selected genre independently.
        let results = (Array.isArray(data.results) ? data.results : [])
            .filter(item => item && item.id && (item.media_type === "movie" || item.media_type === "tv"));
        if (activeMediaType === "movie" && activeGenre !== "All") {
            results = results.filter(item => item.media_type !== "movie" || (Array.isArray(item.genre_ids) && item.genre_ids.includes(Number(activeGenre))));
        }
        if (activeMediaType === "tv" && activeTVGenreId !== null) {
            results = results.filter(item => item.media_type !== "tv" || (Array.isArray(item.genre_ids) && item.genre_ids.includes(activeTVGenreId)));
        }

        // OTT providers are movie-only. Keep TV results intact and check only
        // the movie subset against the selected provider in India.
        if (activeOTTProviderId) {
            movieContainer.innerHTML = '<p class="loading">Checking movie streaming availability in India...</p>';
            const movieResults = results.filter(item => item.media_type === "movie");
            const matchingMovies = await filterMoviesByProvider(movieResults, activeOTTProviderId, null, requestId);
            if (requestId !== movieRequestId) return;
            const matchingIds = new Set(matchingMovies.map(movie => movie.id));
            results = results.filter(item => item.media_type !== "movie" || matchingIds.has(item.id));
        }

        displayMovies(results, "multi");
    } catch (error) {
        if (requestId !== movieRequestId) return;
        console.error("Unified search error:", error);
        movieContainer.innerHTML = '<div class="error-message"><h3>⚠️ Search could not be completed</h3><p>Please check your connection and try again.</p></div>';
    }
}

function loadMovieResults() {

    const searchInput = document.getElementById("searchInput");
    const query = searchInput ? searchInput.value.trim() : "";

    // TMDB Search has no watch-provider parameter. Search results are checked
    // against each movie's India provider data when an OTT filter is active.
    if (query) {
        const params = new URLSearchParams({
            query,
            language: "en-US",
            page: "1",
            include_adult: "false"
        });
        fetchMovies(`${API_BASE_URL}/search/movie?${params}`, {
            providerId: activeOTTProviderId,
            genreId: activeGenre === "All" ? null : activeGenre
        });
        return;
    }

    if (activeOTTProviderId) {
        const params = new URLSearchParams({
            language: "en-US",
            page: "1",
            sort_by: "popularity.desc",
            watch_region: WATCH_REGION,
            with_watch_providers: activeOTTProviderId,
            // TMDB returns results available by subscription, free, or ad-supported viewing.
            with_watch_monetization_types: "flatrate"
        });

        if (activeGenre !== "All") {
            params.set("with_genres", activeGenre);
        }

        fetchMovies(`${API_BASE_URL}/discover/movie?${params}`, {
            additionalMonetizationTypes: "free|ads"
        });
        return;
    }

    if (activeGenre !== "All") {
        const params = new URLSearchParams({
            language: "en-US",
            page: "1",
            sort_by: "popularity.desc",
            with_genres: activeGenre
        });
        fetchMovies(`${API_BASE_URL}/discover/movie?${params}`);
        return;
    }

    fetchMovies(`${API_BASE_URL}/movie/popular?language=en-US&page=1`);

}


function getMovieWatchAvailability(movieId) {

    if (movieWatchAvailabilityCache.has(movieId)) {
        return Promise.resolve(movieWatchAvailabilityCache.get(movieId));
    }

    const url = `${API_BASE_URL}/movie/${movieId}/watch/providers`;
    return tmdbFetch(url).then(data => {
        const region = data && data.results ? data.results[WATCH_REGION] || null : null;
        movieWatchAvailabilityCache.set(movieId, region);
        return region;
    });

}


async function filterMoviesByProvider(movies, providerId, genreId, requestId) {

    const candidates = (movies || []).filter(movie =>
        !genreId || (Array.isArray(movie.genre_ids) && movie.genre_ids.includes(Number(genreId)))
    );
    const matchingMovies = [];
    let failedChecks = 0;

    // Limit parallel requests so a title search does not overwhelm TMDB.
    for (let index = 0; index < candidates.length; index += 5) {
        if (requestId !== movieRequestId) return [];

        const batch = candidates.slice(index, index + 5);
        const results = await Promise.all(batch.map(async movie => {
            try {
                const region = await getMovieWatchAvailability(movie.id);
                const offers = region
                    ? [...(region.flatrate || []), ...(region.free || []), ...(region.ads || [])]
                    : [];
                return {
                    movie,
                    matches: offers.some(offer => String(offer.provider_id) === String(providerId))
                };
            }
            catch (error) {
                return { movie, failed: true };
            }
        }));

        if (requestId !== movieRequestId) return [];

        results.forEach(result => {
            if (result.failed) failedChecks += 1;
            else if (result.matches) matchingMovies.push(result.movie);
        });
    }

    if (candidates.length > 0 && failedChecks === candidates.length) {
        throw new Error("Could not check streaming availability.");
    }

    return matchingMovies;

}


function refreshOTTFilterButtons() {

    const selectedId = activeOTTProviderId || "all";
    document.querySelectorAll("#ottProviderFilters [data-provider-id]").forEach(button => {
        const selected = button.dataset.providerId === selectedId;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });

}


function selectOTTProvider(providerId) {

    if (providerId === "all") {
        activeOTTProviderId = null;
    }
    else if (availableOTTProviders.some(provider => String(provider.provider_id) === String(providerId))) {
        activeOTTProviderId = String(providerId);
    }
    else {
        return;
    }

    refreshOTTFilterButtons();
    const query = document.getElementById("searchInput");
    if (query && query.value.trim()) searchMovies();
    else loadMovieResults();

}


function sortOTTProviders(providers) {

    const preferredOrder = ["netflix", "amazon prime video", "jiohotstar", "zee5", "sony liv"];
    return providers.slice().sort((a, b) => {
        const nameA = (a.provider_name || "").toLowerCase();
        const nameB = (b.provider_name || "").toLowerCase();
        const priorityA = preferredOrder.findIndex(name => nameA.includes(name));
        const priorityB = preferredOrder.findIndex(name => nameB.includes(name));
        const rankA = priorityA < 0 ? preferredOrder.length : priorityA;
        const rankB = priorityB < 0 ? preferredOrder.length : priorityB;
        return rankA - rankB || (a.display_priority || 999) - (b.display_priority || 999) || nameA.localeCompare(nameB);
    });

}


function createOTTProviderButton(provider) {

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ott-filter-button";
    button.dataset.providerId = String(provider.provider_id);
    button.setAttribute("aria-pressed", "false");
    button.title = `Show movies on ${provider.provider_name}`;

    if (provider.logo_path) {
        const logo = document.createElement("img");
        logo.src = PROVIDER_IMAGE_URL + provider.logo_path;
        logo.alt = "";
        logo.loading = "lazy";
        button.appendChild(logo);
    }
    else {
        const icon = document.createElement("span");
        icon.className = "ott-provider-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "🎬";
        button.appendChild(icon);
    }

    const name = document.createElement("span");
    name.textContent = provider.provider_name || "Streaming service";
    button.appendChild(name);
    return button;

}


async function loadOTTProviders() {

    const list = document.getElementById("ottProviderList");
    const status = document.getElementById("ottFilterStatus");
    const filterRow = document.getElementById("ottProviderFilters");
    if (!list || !filterRow) return;

    filterRow.addEventListener("click", event => {
        const button = event.target.closest("[data-provider-id]");
        if (button && filterRow.contains(button)) {
            selectOTTProvider(button.dataset.providerId);
        }
    });

    try {
        const params = new URLSearchParams({ language: "en-US", watch_region: WATCH_REGION });
        const data = await tmdbFetch(`${API_BASE_URL}/watch/providers/movie?${params}`);
        availableOTTProviders = sortOTTProviders((data.results || []).filter(provider => provider.provider_id && provider.provider_name));
        list.replaceChildren();

        if (availableOTTProviders.length === 0) {
            list.innerHTML = '<p class="ott-provider-error">No streaming platforms were returned for India.</p>';
        }
        else {
            availableOTTProviders.forEach(provider => list.appendChild(createOTTProviderButton(provider)));
        }

        if (status) status.textContent = `${availableOTTProviders.length} platforms available in India`;
        refreshOTTFilterButtons();
    }
    catch (error) {
        console.error("OTT platform loading error:", error);
        list.innerHTML = '<p class="ott-provider-error">Platforms could not be loaded. You can still browse movies below.</p>';
        if (status) status.textContent = "Platforms unavailable";
    }

}


/* =========================================================
   GET MOVIE DETAILS
   ========================================================= */

async function getMovieDetails(movieId) {
    const requestId = ++detailsRequestId;
    currentMovieId = movieId;
    currentTVId = null;
    movieDetails.style.display =
        "block";


    movieDetails.innerHTML = `

        <div class="loading">

            Loading movie details...

        </div>

    `;


    const url =
        `${API_BASE_URL}/movie/${movieId}` +
        `?language=en-US` +
        `&append_to_response=credits,videos`;


    try {

        const movie =
            await tmdbFetch(url);
        if (requestId !== detailsRequestId) return;

        currentMovieId = movieId;


        /*
          Display normal movie information.
        */

        displayMovieDetails(
            movie
        );


        /*
          Get OTT availability.
        */

        getWatchProviders(
            movieId
        );


        /*
          Get similar movies.
        */

        getSimilarMovies(
            movieId
        );

    }

    catch (error) {
        if (requestId !== detailsRequestId) return;

        console.error(
            "Movie details error:",
            error
        );


        movieDetails.innerHTML = `

            <div class="error-message">

                <h3>
                    ⚠️ Unable to load details
                </h3>

                <p>
                    Please try again.
                </p>

            </div>

        `;

    }

}


/* =========================================================
   DISPLAY MOVIE DETAILS
   ========================================================= */

function displayMovieDetails(movie) {

    const trailer =
        findTrailer(movie.videos);


    const backdrop =
        movie.backdrop_path

            ? BACKDROP_URL +
              movie.backdrop_path

            : "";


    const poster =
        movie.poster_path

            ? IMAGE_URL +
              movie.poster_path

            : "https://via.placeholder.com/500x750?text=No+Poster";


    /* -----------------------------------------------------
       Genres
       ----------------------------------------------------- */

    const genres =
        movie.genres &&
        movie.genres.length

            ? movie.genres
                .map(
                    genre => genre.name
                )
                .join(" • ")

            : "Genre unavailable";


    /* -----------------------------------------------------
       Runtime
       ----------------------------------------------------- */

    const runtime =
        movie.runtime

            ? `${movie.runtime} minutes`

            : "Runtime unavailable";


    /* -----------------------------------------------------
       Rating
       ----------------------------------------------------- */

    const rating =
        movie.vote_average !== undefined

            ? Number(
                movie.vote_average
              ).toFixed(1)

            : "N/A";


    /* -----------------------------------------------------
       Languages
       ----------------------------------------------------- */

    const language =
        movie.spoken_languages &&
        movie.spoken_languages.length

            ? movie.spoken_languages
                .map(
                    lang =>
                        lang.english_name ||
                        lang.name
                )
                .join(", ")

            : "Language unavailable";


    /* -----------------------------------------------------
       Director
       ----------------------------------------------------- */

    let director =
        "Director unavailable";


    if (
        movie.credits &&
        movie.credits.crew
    ) {

        const directorPerson =
            movie.credits.crew.find(
                person =>
                    person.job ===
                    "Director"
            );


        if (directorPerson) {

            director =
                directorPerson.name;

        }

    }


    /* -----------------------------------------------------
       Cast
       ----------------------------------------------------- */

    const cast =
        movie.credits &&
        movie.credits.cast

            ? movie.credits.cast.slice(
                0,
                8
              )

            : [];


    /* -----------------------------------------------------
       Production Companies
       ----------------------------------------------------- */

    const companies =
        movie.production_companies ||
        [];


    /* -----------------------------------------------------
       Trailer Button
       ----------------------------------------------------- */

    let trailerButton = "";


    if (trailer) {

        trailerButton = `

            <button
                class="trailer-button"
                onclick="openTrailer('${trailer.key}')"
            >

                ▶ Watch Trailer

            </button>

        `;

    }

    else {

        trailerButton = `

            <p class="no-trailer">

                🎬 Trailer not available

            </p>

        `;

    }


    /* -----------------------------------------------------
       Backdrop Style
       ----------------------------------------------------- */

    const backdropStyle =
        backdrop

            ? `
                style="
                    background-image:
                    linear-gradient(
                        to bottom,
                        rgba(15,15,15,0.35),
                        rgba(15,15,15,1)
                    ),
                    url('${backdrop}');
                "
              `

            : "";


    /* =====================================================
       DETAILS HTML
       ===================================================== */

    movieDetails.innerHTML = `

        <div
            class="details-backdrop"
            ${backdropStyle}
        >

            <button
                class="close-details"
                onclick="closeMovieDetails()"
            >
                ✕
            </button>


            <div class="details-content">

                <img
                    class="details-poster"
                    src="${poster}"
                    alt="${movie.title || "Movie"}"
                >


                <div class="details-info">

                    <h1>
                        ${movie.title || "Unknown Title"}
                    </h1>


                    <div class="details-rating">

                        ⭐ ${rating}

                    </div>


                    <div class="details-meta">

                        <span>
                            📅
                            ${movie.release_date || "Unknown"}
                        </span>

                        <span>
                            ⏱️
                            ${runtime}
                        </span>

                        <span>
                            🌐
                            ${language}
                        </span>

                    </div>


                    <div class="details-genres">

                        ${genres}

                    </div>


                    <div class="director-box">

                        🎬 Director:
                        <strong>
                            ${director}
                        </strong>

                    </div>


                    <p class="details-overview">

                        ${
                            movie.overview ||
                            "No overview available."
                        }

                    </p>


                    ${trailerButton}


                </div>

            </div>


            <div class="extra-details">

                <!-- CAST -->

                <div class="cast-section">

                    <h2>
                        🎭 Cast
                    </h2>


                    <div class="cast-container">

                        ${
                            cast.length

                                ? cast
                                    .map(person => {

                                        const castImage =
                                            person.profile_path

                                                ? IMAGE_URL +
                                                  person.profile_path

                                                : "https://via.placeholder.com/185x278?text=No+Image";


                                        return `

                                            <div class="cast-card">

                                                <img
                                                    src="${castImage}"
                                                    alt="${person.name}"
                                                >

                                                <h4>
                                                    ${person.name}
                                                </h4>

                                                <p>
                                                    ${
                                                        person.character ||
                                                        "Unknown role"
                                                    }
                                                </p>

                                            </div>

                                        `;

                                    })
                                    .join("")

                                : `
                                    <p>
                                        Cast information unavailable.
                                    </p>
                                `
                        }

                    </div>

                </div>


                <!-- PRODUCTION -->

                <div class="production-section">

                    <h2>
                        🏢 Production Companies
                    </h2>


                    <div class="production-container">

                        ${
                            companies.length

                                ? companies
                                    .map(company => {

                                        const companyLogo =
                                            company.logo_path

                                                ? IMAGE_URL +
                                                  company.logo_path

                                                : null;


                                        return `

                                            <div class="company-card">

                                                ${
                                                    companyLogo

                                                        ? `

                                                            <img
                                                                src="${companyLogo}"
                                                                alt="${company.name}"
                                                            >

                                                          `

                                                        : `
                                                            <div
                                                                class="company-no-logo"
                                                            >
                                                                🎬
                                                            </div>
                                                          `
                                                }


                                                <p>
                                                    ${company.name}
                                                </p>

                                            </div>

                                        `;

                                    })
                                    .join("")

                                : `
                                    <p>
                                        Production information unavailable.
                                    </p>
                                `
                        }

                    </div>

                </div>


                <!-- OTT -->

                <div class="ott-section">

                    <h2>
                        📺 Where to Watch in India
                    </h2>


                    <div
                        id="watchProviders"
                        class="watch-providers"
                    >

                        <p class="loading">

                            Loading streaming options...

                        </p>

                    </div>

                </div>


                <!-- SIMILAR MOVIES -->

                <div class="similar-section">

                    <h2>
                        🎬 Similar Movies
                    </h2>


                    <div
                        id="similarMovies"
                        class="similar-movies"
                    >

                        <p class="loading">

                            Loading similar movies...

                        </p>

                    </div>

                </div>

            </div>

        </div>

    `;


    /* --- Add watchlist button to movie details --- */
    const detailsInfoDiv = movieDetails.querySelector(".details-info");
    if (detailsInfoDiv) {
        const detailsWlBtn = document.createElement("button");
        detailsWlBtn.id = "detailsWatchlistBtn";
        detailsWlBtn.dataset.movieId = movie.id;
        detailsWlBtn.dataset.mediaType = "movie";

        if (isInWatchlist(movie.id, "movie")) {
            detailsWlBtn.className = "details-watchlist-btn watchlist-btn-added";
            detailsWlBtn.innerHTML = "✓ In Watchlist";
            detailsWlBtn.title = "Click to remove from Watchlist";
        } else {
            detailsWlBtn.className = "details-watchlist-btn watchlist-btn-add";
            detailsWlBtn.innerHTML = "+ Add to Watchlist";
            detailsWlBtn.title = "Add this movie to your Watchlist";
        }

        const movieDataForWl = {
            id: movie.id,
            title: movie.title || "Unknown Title",
            poster_path: movie.poster_path || null,
            release_date: movie.release_date || "Unknown",
            vote_average: movie.vote_average !== undefined ? movie.vote_average : 0
        };

        detailsWlBtn.addEventListener("click", function() {
            toggleWatchlist(movieDataForWl, "movie");
        });

        detailsInfoDiv.appendChild(detailsWlBtn);
        detailsInfoDiv.appendChild(createLikeButton(movie, "movie", { details: true }));
    }


    /*
      Scroll to details.
    */

    setTimeout(() => {

        movieDetails.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

    }, 100);

}


/* =========================================================
   OTT / WATCH PROVIDERS
   ========================================================= */

async function getWatchProviders(movieId) {

    const watchProviders =
        document.getElementById(
            "watchProviders"
        );


    if (!watchProviders) {
        return;
    }


    /*
      Show cached data if available.
    */

    if (
        watchProviderCache[movieId]
    ) {

        displayWatchProviders(
            watchProviderCache[movieId]
        );

        return;

    }


    watchProviders.innerHTML = `

        <p class="loading">

            Loading streaming options...

        </p>

    `;


    const url =
        `${API_BASE_URL}/movie/${movieId}/watch/providers`;


    try {

        const data =
            await tmdbFetch(url);


        watchProviderCache[movieId] =
            data;


        /*
          Prevent old movie's provider
          information from appearing on
          the newly opened movie.
        */

        if (
            currentMovieId !== movieId
        ) {

            return;

        }


        displayWatchProviders(
            data
        );

    }

    catch (error) {

        console.error(
            "OTT provider error:",
            error
        );


        if (
            currentMovieId !== movieId
        ) {

            return;

        }


        watchProviders.innerHTML = `

            <div class="no-watch-providers">

                <p>

                    ⚠️ Unable to load
                    streaming information.

                </p>

            </div>

        `;

    }

}


/* =========================================================
   DISPLAY OTT PROVIDERS
   ========================================================= */

function displayWatchProviders(data) {

    const watchProviders =
        document.getElementById(
            "watchProviders"
        );


    if (!watchProviders) {
        return;
    }


    const regionData =
        data &&
        data.results
            ? data.results[WATCH_REGION]
            : null;


    if (!regionData) {

        watchProviders.innerHTML = `

            <div class="no-watch-providers">

                <p>

                    😕 No streaming,
                    rental, or purchase
                    information found
                    in India.

                </p>

                <p class="watch-provider-credit">

                    Streaming availability data
                    powered by
                    <strong>JustWatch</strong>.

                </p>

            </div>

        `;

        return;

    }


    /*
      Streaming providers:
      - flatrate
      - free
      - ads
    */

    const streamingProviders = [
        ...(regionData.flatrate || []),
        ...(regionData.free || []),
        ...(regionData.ads || [])
    ];


    /*
      Remove duplicate providers.
    */

    const uniqueStreamingProviders =
        Array.from(
            new Map(
                streamingProviders.map(
                    provider => [
                        provider.provider_id,
                        provider
                    ]
                )
            ).values()
        );


    /*
      Rental providers.
    */

    const rentProviders =
        regionData.rent || [];


    const uniqueRentProviders =
        Array.from(
            new Map(
                rentProviders.map(
                    provider => [
                        provider.provider_id,
                        provider
                    ]
                )
            ).values()
        );


    /*
      Purchase providers.
    */

    const buyProviders =
        regionData.buy || [];


    const uniqueBuyProviders =
        Array.from(
            new Map(
                buyProviders.map(
                    provider => [
                        provider.provider_id,
                        provider
                    ]
                )
            ).values()
        );


    let html = "";


    /* =====================================================
       STREAMING
       ===================================================== */

    if (
        uniqueStreamingProviders.length > 0
    ) {

        html += `

            <div class="ott-group">

                <h3>
                    📡 Streaming
                </h3>


                <div class="provider-container">

                    ${
                        uniqueStreamingProviders
                            .map(
                                provider => {

                                    const logo =
                                        provider.logo_path

                                            ? PROVIDER_IMAGE_URL +
                                              provider.logo_path

                                            : null;


                                    return `

                                        <div
                                            class="provider-card"
                                            title="${provider.provider_name}"
                                        >

                                            ${
                                                logo

                                                    ? `

                                                        <img
                                                            src="${logo}"
                                                            alt="${provider.provider_name}"
                                                        >

                                                      `

                                                    : `

                                                        <div
                                                            class="provider-no-logo"
                                                        >
                                                            🎬
                                                        </div>

                                                      `
                                            }


                                            <p>
                                                ${provider.provider_name}
                                            </p>

                                        </div>

                                    `;

                                }
                            )
                            .join("")
                    }

                </div>

            </div>

        `;

    }


    /* =====================================================
       RENT
       ===================================================== */

    if (
        uniqueRentProviders.length > 0
    ) {

        html += `

            <div class="ott-group">

                <h3>
                    💳 Rent
                </h3>


                <div class="provider-container">

                    ${
                        uniqueRentProviders
                            .map(
                                provider => {

                                    const logo =
                                        provider.logo_path

                                            ? PROVIDER_IMAGE_URL +
                                              provider.logo_path

                                            : null;


                                    return `

                                        <div
                                            class="provider-card"
                                            title="${provider.provider_name}"
                                        >

                                            ${
                                                logo

                                                    ? `

                                                        <img
                                                            src="${logo}"
                                                            alt="${provider.provider_name}"
                                                        >

                                                      `

                                                    : `

                                                        <div
                                                            class="provider-no-logo"
                                                        >
                                                            🎬
                                                        </div>

                                                      `
                                            }


                                            <p>
                                                ${provider.provider_name}
                                            </p>

                                        </div>

                                    `;

                                }
                            )
                            .join("")
                    }

                </div>

            </div>

        `;

    }


    /* =====================================================
       BUY
       ===================================================== */

    if (
        uniqueBuyProviders.length > 0
    ) {

        html += `

            <div class="ott-group">

                <h3>
                    🛒 Buy
                </h3>


                <div class="provider-container">

                    ${
                        uniqueBuyProviders
                            .map(
                                provider => {

                                    const logo =
                                        provider.logo_path

                                            ? PROVIDER_IMAGE_URL +
                                              provider.logo_path

                                            : null;


                                    return `

                                        <div
                                            class="provider-card"
                                            title="${provider.provider_name}"
                                        >

                                            ${
                                                logo

                                                    ? `

                                                        <img
                                                            src="${logo}"
                                                            alt="${provider.provider_name}"
                                                        >

                                                      `

                                                    : `

                                                        <div
                                                            class="provider-no-logo"
                                                        >
                                                            🎬
                                                        </div>

                                                      `
                                            }


                                            <p>
                                                ${provider.provider_name}
                                            </p>

                                        </div>

                                    `;

                                }
                            )
                            .join("")
                    }

                </div>

            </div>

        `;

    }


    /* =====================================================
       NO PROVIDERS
       ===================================================== */

    if (html === "") {

        html = `

            <div class="no-watch-providers">

                <p>

                    😕 No streaming,
                    rental, or purchase
                    options found in India.

                </p>

            </div>

        `;

    }


    /* =====================================================
       JUSTWATCH ATTRIBUTION
       ===================================================== */

    html += `

        <p class="watch-provider-credit">

            Streaming availability data
            powered by
            <strong>JustWatch</strong>.

        </p>

    `;


    watchProviders.innerHTML =
        html;

}


/* =========================================================
   FIND TRAILER
   ========================================================= */

function findTrailer(videos) {

    if (
        !videos ||
        !videos.results
    ) {

        return null;

    }


    const youtubeVideos =
        videos.results.filter(
            video =>
                video.site === "YouTube"
        );


    if (
        youtubeVideos.length === 0
    ) {

        return null;

    }


    /*
      Priority 1:
      Official Trailer
    */

    let trailer =
        youtubeVideos.find(
            video =>
                video.type === "Trailer" &&
                video.official === true
        );


    /*
      Priority 2:
      Any Trailer
    */

    if (!trailer) {

        trailer =
            youtubeVideos.find(
                video =>
                    video.type === "Trailer"
            );

    }


    /*
      Priority 3:
      Official Teaser
    */

    if (!trailer) {

        trailer =
            youtubeVideos.find(
                video =>
                    video.type === "Teaser" &&
                    video.official === true
            );

    }


    /*
      Priority 4:
      Any Teaser
    */

    if (!trailer) {

        trailer =
            youtubeVideos.find(
                video =>
                    video.type === "Teaser"
            );

    }


    return trailer || null;

}


/* =========================================================
   OPEN TRAILER
   ========================================================= */

function openTrailer(videoKey) {

    if (!videoKey) {
        return;
    }

    const trailerModal =
        document.getElementById("trailerModal");
    const trailerFrame =
        document.getElementById("trailerFrame");

    if (!trailerModal || !trailerFrame) {
        return;
    }

    trailerFrame.src =
        `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoKey)}?autoplay=1&rel=0`;
    trailerModal.classList.add("is-open");
    trailerModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("trailer-modal-open");
}


function closeTrailer() {

    const trailerModal =
        document.getElementById("trailerModal");
    const trailerFrame =
        document.getElementById("trailerFrame");

    if (!trailerModal || !trailerFrame) {
        return;
    }

    trailerModal.classList.remove("is-open");
    trailerModal.setAttribute("aria-hidden", "true");
    trailerFrame.src = "";
    document.body.classList.remove("trailer-modal-open");
}


document.addEventListener("keydown", function(event) {
    if (activeAuthModal && activeAuthModal.getAttribute("aria-hidden") !== "true") {
        if (event.key === "Escape") {
            closeAuthModal();
            return;
        }
        if (event.key === "Tab") {
            const focusable = Array.from(activeAuthModal.querySelectorAll("button:not([disabled]), input:not([disabled])"));
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }
    if (event.key === "Escape") closeTrailer();
});

/* =========================================================
   GET SIMILAR MOVIES
   ========================================================= */

async function getSimilarMovies(movieId) {

    const url =
        `${API_BASE_URL}/movie/${movieId}/similar` +
        `?language=en-US&page=1`;


    try {

        const data =
            await tmdbFetch(url);


        displaySimilarMovies(
            data.results
        );

    }

    catch (error) {

        console.error(
            "Similar movies error:",
            error
        );


        const container =
            document.getElementById(
                "similarMovies"
            );


        if (container) {

            container.innerHTML = `

                <p>
                    Similar movies unavailable.
                </p>

            `;

        }

    }

}


/* =========================================================
   DISPLAY SIMILAR MOVIES
   ========================================================= */

function displaySimilarMovies(movies) {

    const container =
        document.getElementById(
            "similarMovies"
        );


    if (!container) {
        return;
    }


    if (
        !movies ||
        movies.length === 0
    ) {

        container.innerHTML = `

            <p>
                Similar movies unavailable.
            </p>

        `;

        return;

    }


    container.innerHTML =
        movies
            .slice(0, 6)
            .map(movie => {

                const poster =
                    movie.poster_path

                        ? IMAGE_URL +
                          movie.poster_path

                        : "https://via.placeholder.com/500x750?text=No+Poster";


                return `

                    <div
                        class="similar-card"
                        onclick="getMovieDetails(${movie.id})"
                    >

                        <img
                            src="${poster}"
                            alt="${movie.title || "Movie"}"
                        >


                        <h3>
                            ${movie.title || "Unknown Title"}
                        </h3>

                    </div>

                `;

            })
            .join("");

}


/* =========================================================
   CLOSE MOVIE DETAILS
   ========================================================= */

function closeMovieDetails() {
    detailsRequestId++;
    if (!movieDetails) {
        return;
    }


    movieDetails.style.display =
        "none";


    currentMovieId = null;
    currentTVId = null;

}


/* =========================================================
   ENTER KEY SEARCH
   ========================================================= */

const searchInput =
    document.getElementById(
        "searchInput"
    );


if (searchInput) {

    searchInput.addEventListener(
        "keydown",
        function(event) {

            if (
                event.key === "Enter"
            ) {

                searchMovies();

            }

        }
    );

}




/* =========================================================
   PERSONAL WATCHLIST
   =========================================================
   The Watchlist is stored in this browser's localStorage. Each
   saved item keeps only the fields needed to draw its card.
   ========================================================= */

const WATCHLIST_KEY = "cinefind_watchlist";
let watchlistItems = [];


function loadWatchlist() {
    let raw;
    try { raw = window.localStorage.getItem(WATCHLIST_KEY); }
    catch (error) { console.warn("Could not read the saved Watchlist.", error); return watchlistItems; }
    if (!raw) return [];

    let savedItems;
    try { savedItems = JSON.parse(raw); }
    catch (error) {
        console.warn("Saved Watchlist data was invalid and has been cleared.", error);
        try { window.localStorage.removeItem(WATCHLIST_KEY); } catch (storageError) {}
        watchlistItems = [];
        return [];
    }
    if (!Array.isArray(savedItems)) {
        try { window.localStorage.removeItem(WATCHLIST_KEY); } catch (error) {}
        watchlistItems = [];
        return [];
    }

    // Older Watchlists contain movie objects with no media_type. Treat those
    // entries as movies and migrate them to the media-aware format on load.
    const uniqueItems = new Map();
    savedItems.forEach(item => {
        const id = Number(item && item.id);
        if (!Number.isSafeInteger(id) || id <= 0) return;
        const rawType = String(item.media_type || item.mediaType || item.type || "movie").toLowerCase();
        const mediaType = rawType === "tv" || rawType === "series" ? "tv" : "movie";
        const saved = {
            id,
            media_type: mediaType,
            title: typeof item.title === "string" && item.title.trim()
                ? item.title
                : typeof item.name === "string" && item.name.trim() ? item.name : "Unknown Title",
            poster_path: typeof item.poster_path === "string" ? item.poster_path : null,
            release_date: typeof item.release_date === "string"
                ? item.release_date
                : typeof item.first_air_date === "string" ? item.first_air_date : "Unknown",
            vote_average: item.vote_average !== null && item.vote_average !== undefined && Number.isFinite(Number(item.vote_average)) ? Number(item.vote_average) : null
        };
        uniqueItems.set(`${mediaType}:${id}`, saved);
    });

    watchlistItems = Array.from(uniqueItems.values());
    const normalized = JSON.stringify(watchlistItems);
    if (normalized !== raw) {
        try { window.localStorage.setItem(WATCHLIST_KEY, normalized); }
        catch (error) { console.warn("Could not migrate the saved Watchlist.", error); }
    }
    return watchlistItems;
}


function saveWatchlist(items) {
    watchlistItems = items;
    try { window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items)); }
    catch (error) { console.warn("Could not save the Watchlist in this browser.", error); }
}


function isInWatchlist(itemId, mediaType = "movie") {
    const id = Number(itemId);
    return loadWatchlist().some(item => item.id === id && item.media_type === mediaType);
}


function addToWatchlist(item, mediaType = item && item.media_type === "tv" ? "tv" : "movie") {
    const id = Number(item && item.id);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const type = mediaType === "tv" ? "tv" : "movie";
    const items = loadWatchlist();
    if (items.some(saved => saved.id === id && saved.media_type === type)) return;
    items.push({
        id,
        media_type: type,
        title: item.title || item.name || "Unknown Title",
        poster_path: item.poster_path || null,
        release_date: item.release_date || item.first_air_date || "Unknown",
        vote_average: Number.isFinite(Number(item.vote_average)) ? Number(item.vote_average) : null
    });
    saveWatchlist(items);
    if (window.CineFindDatabase) window.CineFindDatabase.addSavedTitle(items[items.length - 1]).catch(() => {});
    updateWatchlistCount();
    refreshWatchlistButtons(id, type);
    displayWatchlist();
}


function removeFromWatchlist(itemId, mediaType = "movie") {
    const id = Number(itemId);
    const type = mediaType === "tv" ? "tv" : "movie";
    const items = loadWatchlist().filter(item => !(item.id === id && item.media_type === type));
    if (window.CineFindDatabase) window.CineFindDatabase.removeSavedTitle(id, type).catch(() => {});
    saveWatchlist(items);
    updateWatchlistCount();
    refreshWatchlistButtons(id, type);
    displayWatchlist();
}


function toggleWatchlist(item, mediaType = item && item.media_type === "tv" ? "tv" : "movie") {
    if (!item || !item.id) return;
    const type = mediaType === "tv" ? "tv" : "movie";
    if (isInWatchlist(item.id, type)) removeFromWatchlist(item.id, type);
    else addToWatchlist(item, type);
}


function updateWatchlistCount() {

    const navLink = document.getElementById("navWatchlist");
    if (!navLink) return;

    const oldBadge = typeof navLink.querySelector === "function" ? navLink.querySelector(".watchlist-count") : null;
    if (oldBadge) oldBadge.remove();

    const count = loadWatchlist().length;
    if (count > 0) {
        const badge = document.createElement("span");
        badge.className = "watchlist-count";
        badge.textContent = String(count);
        navLink.appendChild(badge);
    }

}


function createWatchlistCardButton(item, mediaType = item && item.media_type === "tv" ? "tv" : "movie") {
    const type = mediaType === "tv" ? "tv" : "movie";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.movieId = String(item.id);
    button.dataset.mediaType = type;
    const saved = isInWatchlist(item.id, type);
    button.className = saved ? "watchlist-btn watchlist-btn-added" : "watchlist-btn watchlist-btn-add";
    button.textContent = saved ? "✓ In Watchlist" : "+ Add to Watchlist";
    button.title = saved ? "Click to remove from Watchlist" : "Add to your Watchlist";
    button.setAttribute("aria-pressed", String(saved));
    button.addEventListener("click", event => {
        event.stopPropagation();
        toggleWatchlist(item, type);
    });
    return button;
}


function refreshWatchlistButtons(itemId, mediaType = "movie") {
    const id = String(itemId);
    const type = mediaType === "tv" ? "tv" : "movie";
    const saved = isInWatchlist(id, type);
    document.querySelectorAll(".watchlist-btn[data-movie-id], .details-watchlist-btn[data-movie-id]")
        .forEach(button => {
            if (button.dataset.movieId !== id || (button.dataset.mediaType || "movie") !== type) return;
            button.className = button.classList.contains("details-watchlist-btn")
                ? `details-watchlist-btn ${saved ? "watchlist-btn-added" : "watchlist-btn-add"}`
                : `watchlist-btn ${saved ? "watchlist-btn-added" : "watchlist-btn-add"}`;
            button.textContent = saved ? "✓ In Watchlist" : "+ Add to Watchlist";
            button.title = saved ? "Click to remove from Watchlist" : "Add to your Watchlist";
            button.setAttribute("aria-pressed", String(saved));
        });
}


function displayWatchlist() {
    const container = document.getElementById("watchlistContainer");
    if (!container) return;
    const items = loadWatchlist();
    container.replaceChildren();
    if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "watchlist-empty";
        const heading = document.createElement("h3");
        heading.textContent = "Your Watchlist is empty";
        const message = document.createElement("p");
        message.textContent = "Browse movies or TV series and add a title to save it here.";
        empty.append(heading, message);
        container.appendChild(empty);
        return;
    }

    items.forEach(item => {
        const mediaType = item.media_type === "tv" ? "tv" : "movie";
        const card = document.createElement("article");
        card.className = "watchlist-card";
        const poster = document.createElement("img");
        poster.src = item.poster_path ? IMAGE_URL + item.poster_path : "https://via.placeholder.com/500x750?text=No+Poster";
        poster.alt = item.title;
        poster.loading = "lazy";
        poster.addEventListener("click", () => openWatchlistItem(item.id, mediaType));
        card.appendChild(poster);

        const info = document.createElement("div");
        info.className = "movie-info";
        const typeLabel = document.createElement("span");
        typeLabel.className = "watchlist-media-badge";
        typeLabel.textContent = mediaType === "tv" ? "TV Series" : "Movie";
        const title = document.createElement("h3");
        title.textContent = item.title;
        title.tabIndex = 0;
        title.addEventListener("click", () => openWatchlistItem(item.id, mediaType));
        title.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openWatchlistItem(item.id, mediaType);
            }
        });
        const release = document.createElement("p");
        release.textContent = `${mediaType === "tv" ? "First aired" : "Release date"}: ${item.release_date || "Unknown"}`;
        const rating = document.createElement("div");
        rating.className = "rating";
        rating.textContent = item.vote_average === null ? "Rating: N/A" : `Rating: ${Number(item.vote_average).toFixed(1)}`;
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "watchlist-btn watchlist-btn-remove";
        removeButton.textContent = "Remove from Watchlist";
        removeButton.addEventListener("click", () => removeFromWatchlist(item.id, mediaType));
        info.append(typeLabel, title, release, rating, removeButton);
        card.appendChild(info);
        container.appendChild(card);
    });
}


function openWatchlistItem(itemId, mediaType = "movie") {
    hideWatchlist();
    if (mediaType === "tv") getTVDetails(Number(itemId));
    else getMovieDetails(Number(itemId));
}


function openWatchlistMovie(movieId) {
    openWatchlistItem(movieId, "movie");
}


async function syncWatchlistWithDatabase() {
    if (!window.CineFindDatabase) return;
    try {
        const syncedItems = await window.CineFindDatabase.syncSavedTitles(loadWatchlist());
        saveWatchlist(syncedItems);
        updateWatchlistCount();
        displayWatchlist();
    } catch (error) {
        // The local copy remains usable; queued changes retry on the next sync.
    }
}


function showWatchlist() {

    const section = document.getElementById("watchlistSection");
    if (!section) return;
    const likesSection = document.getElementById("likesSection");
    if (likesSection) likesSection.style.display = "none";

    [".hero", ".genre-section", ".ott-filter-section", "#tvBrowseControls", ".movie-section"]
        .forEach(selector => {
            const element = document.querySelector(selector);
            if (element) element.style.display = "none";
        });

    if (movieDetails) movieDetails.style.display = "none";
    section.style.display = "block";
    displayWatchlist();
    window.scrollTo({ top: 0, behavior: "smooth" });

}


function hideWatchlist() {
    const section = document.getElementById("watchlistSection");
    if (!section) return;
    section.style.display = "none";
    const likesSection = document.getElementById("likesSection");
    if (likesSection) likesSection.style.display = "none";
    [".hero", ".genre-section", ".ott-filter-section", "#tvBrowseControls", ".movie-section"].forEach(selector => {
        const element = document.querySelector(selector);
        if (element) element.style.display = "";
    });
    applyMediaModeUI();
}

/* =========================================================
   MY LIKES
   Likes use a separate localStorage key from the Watchlist.
   The media type is part of each key so matching TMDB IDs do not collide.
   ========================================================= */
const LIKES_KEY = "cinefind_likes";
let likedItems = [];

function loadLikes() {
    let raw;
    try { raw = window.localStorage.getItem(LIKES_KEY); }
    catch (error) { return likedItems; }
    if (!raw) return [];
    let saved;
    try { saved = JSON.parse(raw); }
    catch (error) {
        try { window.localStorage.removeItem(LIKES_KEY); } catch (storageError) {}
        likedItems = [];
        return [];
    }
    if (!Array.isArray(saved)) {
        try { window.localStorage.removeItem(LIKES_KEY); } catch (storageError) {}
        likedItems = [];
        return [];
    }
    const unique = new Map();
    saved.forEach(item => {
        const id = Number(item && item.id);
        if (!Number.isSafeInteger(id) || id <= 0) return;
        const rawType = String(item.media_type || item.mediaType || item.type || "movie").toLowerCase();
        const mediaType = rawType === "tv" || rawType === "series" ? "tv" : "movie";
        unique.set(mediaType + ":" + id, {
            id,
            media_type: mediaType,
            title: typeof item.title === "string" && item.title.trim() ? item.title : typeof item.name === "string" && item.name.trim() ? item.name : "Unknown Title",
            poster_path: typeof item.poster_path === "string" ? item.poster_path : null,
            release_date: typeof item.release_date === "string" ? item.release_date : typeof item.first_air_date === "string" ? item.first_air_date : "Unknown",
            vote_average: item.vote_average !== null && item.vote_average !== undefined && Number.isFinite(Number(item.vote_average)) ? Number(item.vote_average) : null
        });
    });
    likedItems = Array.from(unique.values());
    return likedItems;
}

function saveLikes(items) {
    likedItems = items;
    try { window.localStorage.setItem(LIKES_KEY, JSON.stringify(items)); } catch (error) {}
}

function isLiked(itemId, mediaType = "movie") {
    const id = Number(itemId);
    const type = mediaType === "tv" ? "tv" : "movie";
    return loadLikes().some(item => item.id === id && item.media_type === type);
}

function addLike(item, mediaType = item && item.media_type === "tv" ? "tv" : "movie") {
    const id = Number(item && item.id);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const type = mediaType === "tv" ? "tv" : "movie";
    const items = loadLikes();
    if (items.some(saved => saved.id === id && saved.media_type === type)) return;
    items.push({
        id,
        media_type: type,
        title: item.title || item.name || "Unknown Title",
        poster_path: item.poster_path || null,
        release_date: item.release_date || item.first_air_date || "Unknown",
        vote_average: Number.isFinite(Number(item.vote_average)) ? Number(item.vote_average) : null
    });
    saveLikes(items);
    refreshLikeButtons(id, type);
    updateLikesCount();
    displayLikes();
}

function removeLike(itemId, mediaType = "movie") {
    const id = Number(itemId);
    const type = mediaType === "tv" ? "tv" : "movie";
    saveLikes(loadLikes().filter(item => !(item.id === id && item.media_type === type)));
    refreshLikeButtons(id, type);
    updateLikesCount();
    displayLikes();
}

function toggleLike(item, mediaType = item && item.media_type === "tv" ? "tv" : "movie") {
    if (!item || !item.id) return;
    if (isLiked(item.id, mediaType)) removeLike(item.id, mediaType);
    else addLike(item, mediaType);
}

function createLikeButton(item, mediaType = item && item.media_type === "tv" ? "tv" : "movie", options = {}) {
    const type = mediaType === "tv" ? "tv" : "movie";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.likeId = String(item.id);
    button.dataset.mediaType = type;
    button.dataset.likeTitle = item.title || item.name || "title";
    button.dataset.likeRole = options.likeRole || "toggle";
    if (options.details) button.className = "like-btn details-like-btn";
    const saved = isLiked(item.id, type);
    button.classList.add("like-btn");
    if (saved) button.classList.add("is-liked");
    button.textContent = saved ? (button.dataset.likeRole === "remove" ? "Remove Like" : "♥ Liked") : "♡ Like";
    button.title = saved ? "Remove from My Likes" : "Add to My Likes";
    button.setAttribute("aria-pressed", String(saved));
    button.setAttribute("aria-label", saved ? "Remove " + button.dataset.likeTitle + " from My Likes" : "Like " + button.dataset.likeTitle);
    button.addEventListener("click", event => {
        event.stopPropagation();
        toggleLike(item, type);
    });
    return button;
}

function refreshLikeButtons(itemId, mediaType = "movie") {
    const id = String(itemId);
    const type = mediaType === "tv" ? "tv" : "movie";
    const saved = isLiked(id, type);
    document.querySelectorAll(".like-btn[data-like-id]").forEach(button => {
        if (button.dataset.likeId !== id || button.dataset.mediaType !== type) return;
        button.classList.toggle("is-liked", saved);
        button.classList.toggle("like-btn-added", saved);
        button.textContent = saved ? (button.dataset.likeRole === "remove" ? "Remove Like" : "♥ Liked") : "♡ Like";
        button.title = saved ? "Remove from My Likes" : "Add to My Likes";
        button.setAttribute("aria-label", saved ? "Remove " + button.dataset.likeTitle + " from My Likes" : "Like " + button.dataset.likeTitle);
        button.setAttribute("aria-pressed", String(saved));
    });
}

function updateLikesCount() {
    const navLink = document.getElementById("navLikes");
    if (!navLink) return;
    const oldBadge = typeof navLink.querySelector === "function" ? navLink.querySelector(".likes-count") : null;
    if (oldBadge) oldBadge.remove();
    const count = loadLikes().length;
    if (count) {
        const badge = document.createElement("span");
        badge.className = "likes-count";
        badge.textContent = String(count);
        navLink.appendChild(badge);
    }
}

function displayLikes() {
    const container = document.getElementById("likesContainer");
    if (!container) return;
    const items = loadLikes();
    container.replaceChildren();
    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "like-empty";
        const heading = document.createElement("h3");
        heading.textContent = "No liked titles yet";
        const message = document.createElement("p");
        message.textContent = "Tap ♡ Like on a movie or TV series to save it here.";
        empty.append(heading, message);
        container.appendChild(empty);
        return;
    }
    items.forEach(item => {
        const mediaType = item.media_type === "tv" ? "tv" : "movie";
        const card = document.createElement("article");
        card.className = "watchlist-card like-card";
        const poster = document.createElement("img");
        poster.src = item.poster_path ? IMAGE_URL + item.poster_path : "https://via.placeholder.com/500x750?text=No+Poster";
        poster.alt = item.title;
        poster.loading = "lazy";
        poster.addEventListener("click", () => openLikedItem(item.id, mediaType));
        const info = document.createElement("div");
        info.className = "movie-info";
        const type = document.createElement("span");
        type.className = "watchlist-media-badge";
        type.textContent = mediaType === "tv" ? "TV Series" : "Movie";
        const title = document.createElement("h3");
        title.textContent = item.title;
        title.tabIndex = 0;
        title.addEventListener("click", () => openLikedItem(item.id, mediaType));
        title.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openLikedItem(item.id, mediaType);
            }
        });
        const date = document.createElement("p");
        date.textContent = (mediaType === "tv" ? "First aired: " : "Release date: ") + (item.release_date || "Unknown");
        const rating = document.createElement("div");
        rating.className = "rating";
        rating.textContent = item.vote_average === null ? "Rating: N/A" : "Rating: " + Number(item.vote_average).toFixed(1);
        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "like-btn like-open-details";
        openButton.textContent = "Open details";
        openButton.addEventListener("click", () => openLikedItem(item.id, mediaType));
        const unlikeButton = createLikeButton(item, mediaType, { likeRole: "remove" });
        unlikeButton.classList.add("like-remove-button");
        info.append(type, title, date, rating, openButton, unlikeButton);
        card.append(poster, info);
        container.appendChild(card);
    });
}

function openLikedItem(itemId, mediaType = "movie") {
    hideLikes();
    if (mediaType === "tv") getTVDetails(Number(itemId));
    else getMovieDetails(Number(itemId));
}

function showLikes() {
    const section = document.getElementById("likesSection");
    if (!section) return;
    [".hero", ".genre-section", ".ott-filter-section", "#tvBrowseControls", ".movie-section"].forEach(selector => {
        const element = document.querySelector(selector);
        if (element) element.style.display = "none";
    });
    const watchlist = document.getElementById("watchlistSection");
    if (watchlist) watchlist.style.display = "none";
    if (movieDetails) movieDetails.style.display = "none";
    section.style.display = "block";
    displayLikes();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function hideLikes() {
    const section = document.getElementById("likesSection");
    if (!section) return;
    section.style.display = "none";
    const watchlist = document.getElementById("watchlistSection");
    if (watchlist) watchlist.style.display = "none";
    [".hero", ".genre-section", ".ott-filter-section", "#tvBrowseControls", ".movie-section"].forEach(selector => {
        const element = document.querySelector(selector);
        if (element) element.style.display = "";
    });
    applyMediaModeUI();
}

const navLikesLink = document.getElementById("navLikes");
if (navLikesLink && document.getElementById("likesSection")) {
    navLikesLink.addEventListener("click", event => {
        event.preventDefault();
        showLikes();
    });
}
const navWatchlistLink = document.getElementById("navWatchlist");
if (navWatchlistLink) {
    navWatchlistLink.addEventListener("click", event => {
        event.preventDefault();
        showWatchlist();
    });
}


const navHomeLink = document.querySelector(".nav-links a[href='#']");
if (navHomeLink && navHomeLink.textContent.trim() === "Home") {
    navHomeLink.addEventListener("click", event => {
        event.preventDefault();
        hideWatchlist();
        hideLikes();
        if (movieDetails) movieDetails.style.display = "none";
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
}


// TV discovery uses the same catalog cards while keeping movie filters independent.
async function fetchTVShows(url) {
    const requestId = ++movieRequestId;
    movieContainer.innerHTML = '<p class="loading">Loading web series...</p>';
    try {
        const data = await tmdbFetch(url);
        if (requestId !== movieRequestId || activeMediaType !== "tv") return;
        let shows = Array.isArray(data.results) ? data.results : [];
        // TMDB search has no genre parameter, so combine search and genre locally.
        if (activeTVGenreId !== null && url.includes("/search/tv")) shows = shows.filter(show => Array.isArray(show.genre_ids) && show.genre_ids.includes(activeTVGenreId));
        displayMovies(shows, "tv");
    } catch (error) {
        if (requestId !== movieRequestId || activeMediaType !== "tv") return;
        console.error("TV show loading error:", error);
        movieContainer.innerHTML = '<div class="error-message"><h3>⚠️ Web series could not be loaded</h3><p>Please check your connection and try again.</p></div>';
    }
}

function loadTVResults() {
    const input = document.getElementById("searchInput");
    const query = input ? input.value.trim() : "";
    let url;
    if (query) {
        const params = new URLSearchParams({ query, language: "en-US", page: "1", include_adult: "false" });
        url = `${API_BASE_URL}/search/tv?${params}`;
    } else if (activeTVGenreId !== null) {
        const params = new URLSearchParams({ language: "en-US", page: "1", sort_by: "popularity.desc", with_genres: String(activeTVGenreId) });
        url = `${API_BASE_URL}/discover/tv?${params}`;
    } else if (activeTVSource === "trending") {
        url = `${API_BASE_URL}/trending/tv/week?language=en-US`;
    } else {
        url = `${API_BASE_URL}/tv/popular?language=en-US&page=1`;
    }
    fetchTVShows(url);
}

function applyMediaModeUI() {
    const isTV = activeMediaType === "tv";
    const movieGenres = document.getElementById("movieGenreButtons");
    const tvGenres = document.getElementById("tvGenreButtons");
    const tvControls = document.getElementById("tvBrowseControls");
    const ott = document.querySelector(".ott-filter-section");
    const heading = document.getElementById("catalogHeading");
    const heroDescription = document.getElementById("heroDescription");
    const search = document.getElementById("searchInput");
    if (movieGenres) movieGenres.style.display = isTV ? "none" : "flex";
    if (tvGenres) tvGenres.style.display = isTV ? "flex" : "none";
    if (tvControls) tvControls.style.display = isTV ? "block" : "none";
    if (ott) ott.style.display = isTV ? "none" : "";
    if (heading) heading.textContent = isTV ? "Web Series" : "Movies";
    if (heroDescription) heroDescription.textContent = isTV ? "Discover popular TV shows and web series." : "Discover movies based on your interests.";
    if (search) search.placeholder = "Search movies and web series...";
}

function switchMediaType(type) {
    hideWatchlist();
    activeMediaType = type === "tv" ? "tv" : "movie";
    movieRequestId++;
    closeMovieDetails();
    applyMediaModeUI();
    const query = document.getElementById("searchInput");
    if (query && query.value.trim()) searchMovies();
    else if (activeMediaType === "tv") loadTVResults();
    else loadMovieResults();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function loadMovieGenres() {
    if (movieGenreLoadPromise) return movieGenreLoadPromise;
    movieGenreLoadPromise = (async () => {
        try {
            const data = await tmdbFetch(`${API_BASE_URL}/genre/movie/list?language=en-US`);
            availableMovieGenres = Array.isArray(data.genres) ? data.genres : [];
            return availableMovieGenres;
        } catch (error) {
            availableMovieGenres = [];
            return [];
        }
    })();
    return movieGenreLoadPromise;
}


function loadTVGenres() {
    if (tvGenreLoadPromise) return tvGenreLoadPromise;
    tvGenreLoadPromise = (async () => {
        const container = document.getElementById("tvGenreButtons");
        const status = document.getElementById("tvGenreStatus");
        try {
            const data = await tmdbFetch(`${API_BASE_URL}/genre/tv/list?language=en-US`);
            availableTVGenres = Array.isArray(data.genres) ? data.genres : [];
            if (container) {
                container.innerHTML = '<button type="button" class="tv-genre-button is-selected" data-tv-genre="all">All TV Genres</button>';
                availableTVGenres.forEach(genre => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "tv-genre-button";
                    button.dataset.tvGenre = String(genre.id);
                    button.textContent = genre.name;
                    container.appendChild(button);
                });
            }
            if (status) status.textContent = availableTVGenres.length ? "Choose a TV genre or explore all shows." : "TV genres are unavailable.";
            return availableTVGenres;
        } catch (error) {
            if (status) status.textContent = "TV genres are unavailable right now.";
            availableTVGenres = [];
            return [];
        }
    })();
    return tvGenreLoadPromise;
}


const tvGenreButtons = document.getElementById("tvGenreButtons");
if (tvGenreButtons) tvGenreButtons.addEventListener("click", event => {
    const button = event.target.closest("[data-tv-genre]");
    if (!button) return;
    activeTVGenreId = button.dataset.tvGenre === "all" ? null : Number(button.dataset.tvGenre);
    tvGenreButtons.querySelectorAll("[data-tv-genre]").forEach(item => item.classList.toggle("is-selected", item === button));
    const query = document.getElementById("searchInput");
    if (query && query.value.trim()) searchMovies();
    else loadTVResults();
});

const tvSourceButtons = document.querySelectorAll("[data-tv-source]");
tvSourceButtons.forEach(button => button.addEventListener("click", () => {
    activeTVSource = button.dataset.tvSource;
    activeTVGenreId = null;
    const genres = document.getElementById("tvGenreButtons");
    if (genres) genres.querySelectorAll("[data-tv-genre]").forEach(item => item.classList.toggle("is-selected", item.dataset.tvGenre === "all"));
    tvSourceButtons.forEach(item => item.classList.toggle("is-selected", item === button));
    const query = document.getElementById("searchInput");
    if (query && query.value.trim()) searchMovies();
    else loadTVResults();
}));

const navMoviesLink = document.getElementById("navMovies");
if (navMoviesLink) navMoviesLink.addEventListener("click", event => { event.preventDefault(); switchMediaType("movie"); });
const navTVLink = document.getElementById("navTV");
if (navTVLink) navTVLink.addEventListener("click", event => { event.preventDefault(); switchMediaType("tv"); });

async function getTVDetails(seriesId) {
    const requestId = ++detailsRequestId;
    currentDetailsType = "tv";
    currentTVId = seriesId;
    currentMovieId = null;
    movieRequestId++;
    if (movieDetails) { movieDetails.style.display = "block"; movieDetails.innerHTML = '<div class="loading">Loading series details...</div>'; }
    const base = `${API_BASE_URL}/tv/${seriesId}`;
    try {
        const [series, credits] = await Promise.all([
            tmdbFetch(`${base}?language=en-US&append_to_response=videos`),
            tmdbFetch(`${base}/credits?language=en-US`)
        ]);
        if (requestId !== detailsRequestId) return;
        displayTVDetails(series, credits);
        getTVWatchProviders(seriesId, requestId);
        getSimilarTVShows(seriesId, requestId);
    } catch (error) {
        if (requestId !== detailsRequestId) return;
        console.error("TV details loading error:", error);
        movieDetails.innerHTML = '<div class="error-message"><h3>⚠️ Unable to load series details</h3><p>Please try again.</p></div>';
    }
}

function displayTVDetails(series, credits) {
    const trailer = findTrailer(series.videos);
    const backdrop = series.backdrop_path ? BACKDROP_URL + series.backdrop_path : "";
    const poster = series.poster_path ? IMAGE_URL + series.poster_path : "https://via.placeholder.com/500x750?text=No+Poster";
    const cast = credits && Array.isArray(credits.cast) ? credits.cast.slice(0, 8) : [];
    const creators = Array.isArray(series.created_by) ? series.created_by.map(person => person.name).filter(Boolean).join(", ") : "Creator information unavailable";
    const genres = Array.isArray(series.genres) && series.genres.length ? series.genres.map(genre => genre.name).join(" • ") : "Genre unavailable";
    const rating = series.vote_average !== undefined ? Number(series.vote_average).toFixed(1) : "N/A";
    const backdropStyle = backdrop ? `style="background-image:linear-gradient(to bottom,rgba(15,15,15,.35),rgba(15,15,15,1)),url('${backdrop}')"` : "";
    const trailerButton = trailer ? `<button class="trailer-button" onclick="openTrailer('${trailer.key}')">▶ Watch Trailer</button>` : '<p class="no-trailer">🎬 Trailer not available</p>';
    const castCards = cast.length ? cast.map(person => `<div class="cast-card">${person.profile_path ? `<img src="${IMAGE_URL + person.profile_path}" alt="${person.name}">` : '<div class="no-photo">🎭</div>'}<h4>${person.name || "Cast member"}</h4><p>${person.character || "Cast"}</p></div>`).join("") : "<p>Cast information unavailable.</p>";
    movieDetails.innerHTML = `<div class="details-backdrop" ${backdropStyle}><button class="close-details" onclick="closeMovieDetails()">✕</button><div class="details-content"><img class="details-poster" src="${poster}" alt="${series.name || "TV series"}"><div class="details-info"><h1>${series.name || "Unknown Series"}</h1><div class="details-rating">⭐ ${rating}</div><div class="details-meta"><span>📅 First aired: ${series.first_air_date || "Unknown"}</span><span>📅 Last aired: ${series.last_air_date || "Unknown"}</span><span>📚 ${series.number_of_seasons || 0} seasons · ${series.number_of_episodes || 0} episodes</span></div><div class="details-genres">${genres}</div><div class="director-box">✍️ Created by: <strong>${creators || "Creator information unavailable"}</strong></div><p class="details-overview">${series.overview || "No overview available."}</p>${trailerButton}</div></div><div class="extra-details"><div class="cast-section"><h2>🎭 Cast</h2><div class="cast-container">${castCards}</div></div><div class="ott-section"><h2>📺 Where to Watch in India</h2><div id="watchProviders" class="watch-providers"><p class="loading">Loading streaming options...</p></div></div><div class="similar-section"><h2>🎬 Similar TV Shows</h2><div id="similarMovies" class="similar-movies"><p class="loading">Loading similar shows...</p></div></div></div></div>`;
    const detailsInfoDiv = movieDetails.querySelector(".details-info");
    if (detailsInfoDiv) {
        const watchlistButton = createWatchlistCardButton(series, "tv");
        watchlistButton.className = `details-watchlist-btn ${isInWatchlist(series.id, "tv") ? "watchlist-btn-added" : "watchlist-btn-add"}`;
        detailsInfoDiv.appendChild(watchlistButton);
        detailsInfoDiv.appendChild(createLikeButton(series, "tv", { details: true }));
    }
    setTimeout(() => movieDetails.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
}

async function getTVWatchProviders(seriesId, requestId) {
    const target = document.getElementById("watchProviders");
    if (!target) return;
    target.innerHTML = '<p class="loading">Loading streaming options...</p>';
    try {
        const data = await tmdbFetch(`${API_BASE_URL}/tv/${seriesId}/watch/providers`);
        if (requestId !== detailsRequestId || currentTVId !== seriesId) return;
        displayWatchProviders(data);
    } catch (error) {
        if (requestId !== detailsRequestId || currentTVId !== seriesId) return;
        target.innerHTML = '<div class="no-watch-providers"><p>⚠️ Unable to load streaming information.</p></div>';
    }
}

async function getSimilarTVShows(seriesId, requestId) {
    const target = document.getElementById("similarMovies");
    if (!target) return;
    try {
        const data = await tmdbFetch(`${API_BASE_URL}/tv/${seriesId}/similar?language=en-US&page=1`);
        if (requestId !== detailsRequestId || currentTVId !== seriesId) return;
        const shows = (data.results || []).slice(0, 6);
        target.innerHTML = shows.length ? shows.map(show => `<div class="similar-card" role="button" tabindex="0" data-series-id="${show.id}"><img src="${show.poster_path ? IMAGE_URL + show.poster_path : "https://via.placeholder.com/500x750?text=No+Poster"}" alt="${show.name || "TV series"}"><div class="similar-info"><h3>${show.name || "Unknown Series"}</h3><p>⭐ ${show.vote_average !== undefined ? Number(show.vote_average).toFixed(1) : "N/A"}</p></div></div>`).join("") : "<p>Similar shows unavailable.</p>";
        target.querySelectorAll("[data-series-id]").forEach(card => card.addEventListener("click", () => getTVDetails(Number(card.dataset.seriesId))));
    } catch (error) {
        if (requestId === detailsRequestId && target) target.innerHTML = "<p>Similar shows unavailable.</p>";
    }
}

// Load saved movies once at startup and update the navigation badge.
watchlistItems = loadWatchlist();
updateWatchlistCount();
likedItems = loadLikes();
updateLikesCount();
applyMediaModeUI();
loadMovieGenres();
loadTVGenres();


/* Account UI and sign-in are handled by account-ui.js. */

/* =========================================================
   INITIAL LOAD
   ========================================================= */

loadOTTProviders();

// Restore shared movie or TV details and Watchlist routes from mood.html.
const startupParams = new URLSearchParams(window.location && window.location.search || "");
if (movieContainer && document.getElementById("searchInput")) {
    const requestedMedia = startupParams.get("media");
    const requestedId = Number(startupParams.get("id"));
    if (startupParams.get("view") === "watchlist") {
        showWatchlist();
    } else if (startupParams.get("view") === "likes") {
        showLikes();
    } else if (Number.isSafeInteger(requestedId) && requestedId > 0 && requestedMedia === "tv") {
        activeMediaType = "tv";
        applyMediaModeUI();
        getTVDetails(requestedId);
    } else if (Number.isSafeInteger(requestedId) && requestedId > 0 && requestedMedia === "movie") {
        getMovieDetails(requestedId);
    } else if (requestedMedia === "tv") {
        activeMediaType = "tv";
        applyMediaModeUI();
        loadTVResults();
    } else {
        filterGenre("All");
    }
}
