/* =========================================================
   CINEFIND - SCRIPT.JS
   Version 8.0
   TMDB + Movie Details + Trailers + Similar Movies
   + OTT Availability
   ========================================================= */


/* =========================================================
   TMDB CONFIGURATION
   ========================================================= */

const API_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIwNWYwNzEyYjBlMzAwYTA5MDBkNmZkZTRiMDM2NTVhYyIsIm5iZiI6MTc4Njg3MjIyMy4yNDg5OTk4LCJzdWIiOiI2YTgxODE5ZmZlMTQ1NDAyMTZjOTQyZDciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.cB2KBi6KWlu77JtWVD2iWX4jJkovsqQvh9hx-Wu4v8M";

const API_BASE_URL = "https://api.themoviedb.org/3";

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

    const response = await fetch(url, {

        headers: {

            Authorization:
                `Bearer ${API_TOKEN}`,

            accept:
                "application/json"

        }

    });


    if (!response.ok) {

        throw new Error(
            `TMDB API Error: ${response.status}`
        );

    }


    return await response.json();

}


/* =========================================================
   FETCH MOVIES
   ========================================================= */

async function fetchMovies(url) {

    movieContainer.innerHTML = `
        <p class="loading">
            Loading movies...
        </p>
    `;


    try {

        const data =
            await tmdbFetch(url);


        displayMovies(
            data.results
        );

    }

    catch (error) {

        console.error(
            "Movie loading error:",
            error
        );


        movieContainer.innerHTML = `

            <div class="error-message">

                <h3>
                    ⚠️ Something went wrong
                </h3>

                <p>
                    We couldn't load the movies.
                </p>

            </div>

        `;

    }

}


/* =========================================================
   DISPLAY MOVIES
   ========================================================= */

function displayMovies(movies) {

    movieContainer.innerHTML = "";


    if (
        !movies ||
        movies.length === 0
    ) {

        movieContainer.innerHTML = `

            <div class="error-message">

                <h3>
                    😕 No movies found
                </h3>

                <p>
                    Try another search or genre.
                </p>

            </div>

        `;

        return;

    }


    movies.forEach(movie => {

        const card =
            document.createElement("div");


        card.className =
            "movie-card";


        const poster =
            movie.poster_path

                ? IMAGE_URL +
                  movie.poster_path

                : "https://via.placeholder.com/500x750?text=No+Poster";


        const title =
            movie.title ||
            "Unknown Title";


        const releaseDate =
            movie.release_date ||
            "Unknown";


        const rating =
            movie.vote_average !== undefined

                ? Number(movie.vote_average).toFixed(1)

                : "N/A";


        const description =
            movie.overview ||
            "No description available.";


        card.innerHTML = `

            <img
                src="${poster}"
                alt="${title}"
            >

            <div class="movie-info">

                <h3>
                    ${title}
                </h3>

                <p>
                    📅 ${releaseDate}
                </p>

                <div class="rating">
                    ⭐ ${rating}
                </div>

                <p class="description">
                    ${description}
                </p>

            </div>

        `;


        card.addEventListener(
            "click",
            () => {

                getMovieDetails(
                    movie.id
                );

            }
        );


        movieContainer.appendChild(
            card
        );

    });

}


/* =========================================================
   GENRE FILTER
   ========================================================= */

function filterGenre(genre) {

    if (genre === "All") {

        const url =
            `${API_BASE_URL}/movie/popular` +
            `?language=en-US&page=1`;


        fetchMovies(url);

        return;

    }


    const genreId =
        genreIds[genre];


    if (!genreId) {

        console.log(
            "Genre not found:",
            genre
        );

        return;

    }


    const url =
        `${API_BASE_URL}/discover/movie` +
        `?language=en-US` +
        `&page=1` +
        `&sort_by=popularity.desc` +
        `&with_genres=${genreId}`;


    fetchMovies(url);

}


/* =========================================================
   SEARCH MOVIES
   ========================================================= */

async function searchMovies() {

    const searchInput =
        document.getElementById(
            "searchInput"
        );


    if (!searchInput) {
        return;
    }


    const query =
        searchInput.value.trim();


    if (query === "") {

        filterGenre("All");

        return;

    }


    const url =
        `${API_BASE_URL}/search/movie` +
        `?query=${encodeURIComponent(query)}` +
        `&language=en-US` +
        `&page=1` +
        `&include_adult=false`;


    fetchMovies(url);

}


/* =========================================================
   GET MOVIE DETAILS
   ========================================================= */

async function getMovieDetails(movieId) {

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


        currentMovieId =
            movieId;


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


    const youtubeURL =
        `https://www.youtube.com/watch?v=${videoKey}`;


    window.open(
        youtubeURL,
        "_blank"
    );

}


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

    if (!movieDetails) {
        return;
    }


    movieDetails.style.display =
        "none";


    currentMovieId = null;

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
   INITIAL LOAD
   ========================================================= */

filterGenre("All");
