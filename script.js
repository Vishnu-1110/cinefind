const API_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIwNWYwNzEyYjBlMzAwYTA5MDBkNmZkZTRiMDM2NTVhYyIsIm5iZiI6MTc4Njg3MjIyMy4yNDg5OTk4LCJzdWIiOiI2YTgxODE5ZmZlMTQ1NDAyMTZjOTQyZDciLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.cB2KBi6KWlu77JtWVD2iWX4jJkovsqQvh9hx-Wu4v8M";

const API_BASE_URL = "https://api.themoviedb.org/3";

const IMAGE_URL = "https://image.tmdb.org/t/p/w500";

const BACKDROP_URL = "https://image.tmdb.org/t/p/original";



const movieContainer =
    document.getElementById("movieContainer");

const movieDetails =
    document.getElementById("movieDetails");


const genreIds = {

    Action: 28,

    Comedy: 35,

    Thriller: 53,

    Romance: 10749,

    "Sci-Fi": 878,

    Horror: 27

};


async function fetchMovies(url) {

    movieContainer.innerHTML =
        "<p class='loading'>Loading movies...</p>";


    try {

        const response = await fetch(url, {

            headers: {

                Authorization:
                    `Bearer ${API_TOKEN}`,

                accept: "application/json"

            }

        });


        if (!response.ok) {

            throw new Error(
                `HTTP Error: ${response.status}`
            );

        }


        const data =
            await response.json();


        displayMovies(data.results);

    }

    catch (error) {

        console.error(error);


        movieContainer.innerHTML = `

            <div class="error-message">

                <h3>⚠️ Something went wrong</h3>

                <p>
                    We couldn't load the movies.
                </p>

            </div>

        `;

    }

}


function displayMovies(movies) {

    movieContainer.innerHTML = "";


    if (!movies || movies.length === 0) {

        movieContainer.innerHTML = `

            <div class="error-message">

                <h3>😕 No movies found</h3>

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


        card.className = "movie-card";


        const poster = movie.poster_path

            ? IMAGE_URL + movie.poster_path

            : "https://via.placeholder.com/500x750?text=No+Poster";


        const title =
            movie.title || "Unknown Title";


        const releaseDate =
            movie.release_date || "Unknown";


        const rating =
            movie.vote_average
                ? movie.vote_average.toFixed(1)
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

                <h3>${title}</h3>

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


        /*
         * When the user clicks a movie card,
         * open its details.
         */

        card.addEventListener(
            "click",
            function() {

                getMovieDetails(movie.id);

            }
        );


        movieContainer.appendChild(card);

    });

}


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


async function searchMovies() {

    const searchInput =
        document.getElementById("searchInput");


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


async function getMovieDetails(movieId) {

    movieDetails.innerHTML = `
        <div class="loading">
            Loading movie details...
        </div>
    `;

    movieDetails.style.display = "block";

    const url =
    `${API_BASE_URL}/movie/${movieId}` +
    `?language=en-US` +
    `&append_to_response=credits,videos`;

    try {

        const response = await fetch(url, {

            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                accept: "application/json"
            }

        });

        if (!response.ok) {

            throw new Error(
                `HTTP Error: ${response.status}`
            );

        }

        const movie = await response.json();

        displayMovieDetails(movie);

        // Get similar movies separately
        getSimilarMovies(movieId);

    }

    catch (error) {

        console.error(error);

        movieDetails.innerHTML = `

            <div class="error-message">

                <h3>⚠️ Unable to load details</h3>

                <p>
                    Please try again.
                </p>

            </div>

        `;

    }
}


function displayMovieDetails(movie) {

    const trailer = findTrailer(movie.videos);


    const backdrop =
        movie.backdrop_path
            ? BACKDROP_URL + movie.backdrop_path
            : "";


    const poster =
        movie.poster_path
            ? IMAGE_URL + movie.poster_path
            : "https://via.placeholder.com/500x750?text=No+Poster";


    // Genres

    const genres =
        movie.genres && movie.genres.length > 0
            ? movie.genres
                .map(genre => genre.name)
                .join(" • ")
            : "Genre unavailable";


    // Runtime

    const runtime =
        movie.runtime
            ? `${movie.runtime} minutes`
            : "Runtime unavailable";


    // Rating

    const rating =
        movie.vote_average
            ? movie.vote_average.toFixed(1)
            : "N/A";


    // Language

    const language =
        movie.spoken_languages &&
        movie.spoken_languages.length > 0
            ? movie.spoken_languages
                .map(lang => lang.english_name)
                .join(", ")
            : "Language unavailable";


    // Cast

    const cast =
        movie.credits &&
        movie.credits.cast
            ? movie.credits.cast.slice(0, 8)
            : [];


    // Director

    let director = "Director unavailable";


    if (
        movie.credits &&
        movie.credits.crew
    ) {

        const directorPerson =
            movie.credits.crew.find(
                person => person.job === "Director"
            );


        if (directorPerson) {

            director =
                directorPerson.name;

        }

    }


    // Production Companies

    const companies =
        movie.production_companies &&
        movie.production_companies.length > 0
            ? movie.production_companies
            : [];


    movieDetails.innerHTML = `

        <div
            class="details-backdrop"
            style="
                background-image:
                linear-gradient(
                    rgba(0,0,0,0.70),
                    rgba(15,15,15,1)
                ),
                url('${backdrop}');
            "
        >

            <div class="details-content">

                <button
                    class="close-details"
                    onclick="closeMovieDetails()"
                >
                    ✕ Close
                </button>


                <!-- Poster -->

                <img
                    class="details-poster"
                    src="${poster}"
                    alt="${movie.title}"
                >


                <!-- Main Information -->

                <div class="details-info">

                    <h1>
                        ${movie.title}
                    </h1>


                    <div class="details-rating">

                        ⭐ ${rating}

                    </div>


                    <div class="details-meta">

                        📅
                        ${movie.release_date || "Unknown"}

                        &nbsp;&nbsp; | &nbsp;&nbsp;

                        ⏱
                        ${runtime}

                    </div>


                    <div class="details-meta">

                        🌐
                        ${language}

                    </div>


                    <p class="details-genres">

                        🎭 ${genres}

                    </p>


                    <!-- Director -->

                    <div class="director-box">

                        <h3>
                            🎥 Director
                        </h3>

                        <p>
                            ${director}
                        </p>

                    </div>


                    <!-- Overview -->

                    <h2>
                        📝 Overview
                    </h2>


                    <p class="details-overview">

                        ${
                            movie.overview ||
                            "No description available."
                        }

                    </p>


                    <!-- Trailer -->

                    ${
                        trailer
                            ? `

                                <button
                                    class="trailer-button"
                                    onclick="openTrailer('${trailer.key}')"
                                >

                                    ▶ Watch Trailer

                                </button>

                            `
                            : `

                                <p class="no-trailer">

                                    🎬 Trailer not available

                                </p>

                            `
                    }


                </div>

            </div>


            <!-- Cast Section -->

            <div class="extra-details">

                <h2>
                    👥 Cast
                </h2>


                <div class="cast-container">

                    ${
                        cast.length > 0

                        ? cast.map(person => `

                            <div class="cast-card">

                                ${
                                    person.profile_path

                                    ? `

                                        <img
                                            src="${IMAGE_URL}${person.profile_path}"
                                            alt="${person.name}"
                                        >

                                    `

                                    : `

                                        <div class="no-photo">

                                            👤

                                        </div>

                                    `
                                }


                                <h3>

                                    ${person.name}

                                </h3>


                                <p>

                                    ${
                                        person.character ||
                                        "Unknown role"
                                    }

                                </p>

                            </div>

                        `).join("")

                        : `

                            <p>

                                Cast information unavailable.

                            </p>

                        `
                    }

                </div>


                <!-- Production Companies -->

                <h2>

                    🏢 Production Companies

                </h2>


                <div class="company-container">

                    ${
                        companies.length > 0

                        ? companies.map(company => `

                            <div class="company-card">

                                ${
                                    company.logo_path

                                    ? `

                                        <img
                                            src="${IMAGE_URL}${company.logo_path}"
                                            alt="${company.name}"
                                        >

                                    `

                                    : `

                                        <div class="company-no-logo">

                                            🎬

                                        </div>

                                    `
                                }


                                <p>

                                    ${company.name}

                                </p>

                            </div>

                        `).join("")

                        : `

                            <p>

                                Production information unavailable.

                            </p>

                        `
                    }

                </div>


                <!-- Similar Movies -->

                <h2>

                    🎬 Similar Movies

                </h2>


                <div
                    id="similarMovies"
                    class="similar-container"
                >

                    <p class="loading">

                        Loading similar movies...

                    </p>

                </div>


            </div>

        </div>

    `;


    movieDetails.scrollIntoView({

        behavior: "smooth"

    });

}

function findTrailer(videos) {

    if (!videos || !videos.results) {
        return null;
    }


    const youtubeVideos =
        videos.results.filter(video =>
            video.site === "YouTube"
        );


    if (youtubeVideos.length === 0) {
        return null;
    }


    // First priority:
    // Official Trailer

    let trailer =
        youtubeVideos.find(video =>
            video.type === "Trailer" &&
            video.official === true
        );


    // Second priority:
    // Any Trailer

    if (!trailer) {

        trailer =
            youtubeVideos.find(video =>
                video.type === "Trailer"
            );

    }


    // Third priority:
    // Official Teaser

    if (!trailer) {

        trailer =
            youtubeVideos.find(video =>
                video.type === "Teaser" &&
                video.official === true
            );

    }


    // Fourth priority:
    // Any Teaser

    if (!trailer) {

        trailer =
            youtubeVideos.find(video =>
                video.type === "Teaser"
            );

    }


    return trailer || null;

}

function openTrailer(videoKey) {

    const youtubeURL =
        `https://www.youtube.com/watch?v=${videoKey}`;


    window.open(
        youtubeURL,
        "_blank"
    );

}

async function getSimilarMovies(movieId) {

    const similarContainer =
        document.getElementById("similarMovies");


    if (!similarContainer) {
        return;
    }


    const url =
        `${API_BASE_URL}/movie/${movieId}/similar` +
        `?language=en-US&page=1`;


    try {

        const response =
            await fetch(url, {

                headers: {

                    Authorization:
                        `Bearer ${API_TOKEN}`,

                    accept: "application/json"

                }

            });


        if (!response.ok) {

            throw new Error(
                `HTTP Error: ${response.status}`
            );

        }


        const data =
            await response.json();


        displaySimilarMovies(
            data.results
        );

    }

    catch (error) {

        console.error(error);

        similarContainer.innerHTML = `

            <p>
                Similar movies could not be loaded.
            </p>

        `;

    }

}
function displaySimilarMovies(movies) {

    const container =
        document.getElementById("similarMovies");


    if (!movies || movies.length === 0) {

        container.innerHTML = `

            <p>
                No similar movies found.
            </p>

        `;

        return;
    }


    container.innerHTML = "";


    movies
        .slice(0, 6)
        .forEach(movie => {

            const card =
                document.createElement("div");


            card.className =
                "similar-card";


            const poster =
                movie.poster_path

                    ? IMAGE_URL + movie.poster_path

                    : "https://via.placeholder.com/500x750?text=No+Poster";


            card.innerHTML = `

                <img
                    src="${poster}"
                    alt="${movie.title}"
                >

                <div class="similar-info">

                    <h3>
                        ${movie.title}
                    </h3>

                    <p>
                        ⭐
                        ${
                            movie.vote_average
                                ? movie.vote_average.toFixed(1)
                                : "N/A"
                        }
                    </p>

                </div>

            `;


            card.addEventListener(
                "click",
                function() {

                    getMovieDetails(movie.id);

                }
            );


            container.appendChild(card);

        });

}

function closeMovieDetails() {

    movieDetails.style.display = "none";

}


function showTrailerMessage() {

    alert(
        "Trailer integration is coming in Version 3! 🎬"
    );

}


const searchInput =
    document.getElementById("searchInput");


searchInput.addEventListener(
    "keydown",
    function(event) {

        if (event.key === "Enter") {

            searchMovies();

        }

    }
);


filterGenre("All");