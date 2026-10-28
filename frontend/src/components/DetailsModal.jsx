import { useEffect, useState } from "react";
import { titleFor, dateFor, TMDB_BACKDROP, TMDB_IMAGE, TMDB_PROVIDER_IMAGE, tmdb } from "../services/tmdb";
import MovieCard from "./MovieCard";

function googleSearchUrl(name, role) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} ${role}`)}`;
}

function PersonPhotoLink({ person, role }) {
  return <a className="person-photo-link" href={googleSearchUrl(person.name, role)} target="_blank" rel="noopener noreferrer" aria-label={`Search Google for ${person.name}`}>
    {person.profile_path
      ? <img src={`https://image.tmdb.org/t/p/w185${person.profile_path}`} alt={`${person.name}`} loading="lazy" width="120" height="160" />
      : <span className="cast-photo-fallback" aria-hidden="true">🎭</span>}
  </a>;
}

export default function DetailsModal({ item, onClose, onOpen, isSaved, isLiked, onToggleWatchlist, onToggleLike, onTrailer }) {
  const [details, setDetails] = useState(null);
  const [credits, setCredits] = useState(null);
  const [videos, setVideos] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [providerData, setProviderData] = useState(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerError, setProviderError] = useState("");
  const [providerRetry, setProviderRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mediaType = item?.media_type === "tv" ? "tv" : "movie";

  useEffect(() => {
    if (!item) return undefined;
    let alive = true;
    setLoading(true); setError(""); setDetails(null); setCredits(null); setVideos([]); setSimilar([]);
    const base = `${mediaType}/${item.id}`;
    Promise.allSettled([
      tmdb(base, { language: "en-US" }), tmdb(`${base}/credits`, { language: "en-US" }),
      tmdb(`${base}/videos`, { language: "en-US" }), tmdb(`${base}/similar`, { language: "en-US", page: "1" }),
    ]).then(results => {
      if (!alive) return;
      const [info, cast, trailer, similarTitles] = results;
      if (info.status === "fulfilled") setDetails(info.value); else setError("Details could not be loaded.");
      if (cast.status === "fulfilled") setCredits(cast.value);
      if (trailer.status === "fulfilled") setVideos(trailer.value.results || []);
      if (similarTitles.status === "fulfilled") setSimilar((similarTitles.value.results || []).slice(0, 6).map(title => ({ ...title, media_type: mediaType })));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [item?.id, mediaType]);

  useEffect(() => {
    if (!item) return undefined;
    let alive = true;
    setProviderData(null); setProviderError(""); setProviderLoading(true);
    tmdb(`${mediaType}/${item.id}/watch/providers`)
      .then(data => { if (alive) setProviderData(data); })
      .catch(() => { if (alive) setProviderError("Streaming availability could not be loaded."); })
      .finally(() => { if (alive) setProviderLoading(false); });
    return () => { alive = false; };
  }, [item?.id, mediaType, providerRetry]);

  useEffect(() => {
    if (!item) return undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [item, onClose]);

  if (!item) return null;
  const title = titleFor(details || item);
  const india = providerData?.results?.IN;
  const providerGroups = [
    ["Subscription", india?.flatrate], ["Free", india?.free], ["With ads", india?.ads], ["Rent", india?.rent], ["Buy", india?.buy],
  ].filter(([, entries]) => entries?.length);
  const trailer = videos.find(video => video.site === "YouTube" && video.type === "Trailer" && video.key) || videos.find(video => video.site === "YouTube" && video.key);
  const cast = (credits?.cast || []).slice(0, 12);
  const peopleCredits = mediaType === "movie"
    ? (credits?.crew || []).filter(person => person.job === "Director").slice(0, 1)
    : (details?.created_by || []);
  const companies = details?.production_companies || [];
  const overview = details?.overview || item.overview || "No overview is available yet.";

  return (
    <div className="details-modal fixed inset-0 z-[90] overflow-y-auto" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <article className="details-content relative z-10 mx-auto my-5 w-[min(96%,1100px)] rounded-2xl">
        <button type="button" className="details-close" aria-label="Close details" onClick={onClose}>×</button>
        {details?.backdrop_path && <img className="details-backdrop-image" src={`${TMDB_BACKDROP}${details.backdrop_path}`} alt="" />}
        <div className="details-layout relative z-10 grid gap-6 p-5 md:grid-cols-[250px_1fr] md:p-8">
          <div className="details-poster-wrap">{(details?.poster_path || item.poster_path) && <img className="details-poster" src={`${TMDB_IMAGE}${details?.poster_path || item.poster_path}`} alt={`${title} poster`} />}</div>
          <div className="details-info">
            <span className="media-type-badge">{mediaType === "tv" ? "TV Series" : "Movie"}</span><h1>{title}</h1>
            {loading && <p className="loading">Loading details...</p>}
            {error && <p className="error-message">{error}</p>}
            {details && <>
              <p className="details-rating">Rating {Number(details.vote_average || 0).toFixed(1)} / 10 · {dateFor(details) || "Date unavailable"}</p>
              {mediaType === "tv" && <p className="details-meta">{details.number_of_seasons || 0} seasons · {details.number_of_episodes || 0} episodes · Last aired {details.last_air_date || "unknown"}</p>}
              <div className="details-genres flex flex-wrap gap-2">{(details.genres || []).map(genre => <span key={genre.id}>{genre.name}</span>)}</div>
              <h2>Overview</h2><p className="details-overview">{overview}</p>
              {peopleCredits.length > 0 && <section className="details-director-section"><h2>{mediaType === "tv" ? "Created by" : "Director"}</h2><div className="director-photo-row">
                {peopleCredits.map(person => <article className="director-person" key={person.id}>
                  <PersonPhotoLink person={person} role={mediaType === "tv" ? "creator" : "film director"} />
                  <a className="director-person-name" href={googleSearchUrl(person.name, mediaType === "tv" ? "creator" : "film director")} target="_blank" rel="noopener noreferrer">{person.name}</a>
                </article>)}
              </div></section>}
              {cast.length > 0 && <section className="details-cast-section"><h2>Cast</h2><div className="cast-photo-row" aria-label="Cast members">
                {cast.map(person => <article className="cast-person" key={person.id}>
                  <PersonPhotoLink person={person} role="actor" />
                  <a className="cast-person-name" href={googleSearchUrl(person.name, "actor")} target="_blank" rel="noopener noreferrer">{person.name}</a>
                  {person.character && <p className="cast-person-character">{person.character}</p>}
                </article>)}
              </div></section>}
              {companies.length > 0 && <section className="details-production-section"><h2>Production Companies</h2><div className="production-company-list">
                {companies.map(company => <div className="production-company" key={company.id}>
                  {company.logo_path && <img src={`${TMDB_IMAGE}${company.logo_path}`} alt={`${company.name} logo`} loading="lazy" width="150" height="80" />}
                  <span>{company.name}</span>
                </div>)}
              </div></section>}
              <div className="details-actions flex flex-wrap gap-2">
                <button type="button" className="auth-submit w-auto px-5" onClick={() => trailer && onTrailer(trailer.key)} disabled={!trailer}>{trailer ? "Watch Trailer" : "Trailer unavailable"}</button>
                <button type="button" className={`like-btn ${isLiked(item) ? "is-liked" : ""}`} onClick={() => onToggleLike(item)}>{isLiked(item) ? "Liked" : "Like"}</button>
                <button type="button" className={`details-watchlist-btn ${isSaved(item) ? "watchlist-btn-added" : "watchlist-btn-add"}`} onClick={() => onToggleWatchlist(item)}>{isSaved(item) ? "In Watchlist" : "Add to Watchlist"}</button>
              </div>
            </>}
            <section className="ott-section details-availability-section"><h2>Streaming in India</h2>
              {providerLoading ? <p aria-live="polite">Loading streaming availability…</p>
                : providerError ? <p className="availability-error" role="status">{providerError} <button type="button" onClick={() => setProviderRetry(value => value + 1)}>Retry</button></p>
                  : providerGroups.length ? providerGroups.map(([label, entries]) => <div className="availability-provider-group" key={label}>
                    <h3>{label}</h3><div className="ott-provider-list">
                      {entries.map(provider => <span className="provider-chip" key={`${label}-${provider.provider_id}`}>
                        {provider.logo_path && <img src={`${TMDB_PROVIDER_IMAGE}${provider.logo_path}`} alt="" loading="lazy" width="32" height="32" />}
                        <span>{provider.provider_name}</span>
                      </span>)}
                    </div>
                  </div>) : <p>No streaming options were listed for India.</p>}
              {india?.link && <p className="justwatch-credit">Streaming data provided by JustWatch.</p>}
            </section>
          </div>
        </div>
        {!!similar.length && <section className="similar-section px-5 pb-6 md:px-8"><h2>Similar {mediaType === "tv" ? "Series" : "Movies"}</h2><div className="similar-container grid grid-cols-2 gap-4 md:grid-cols-3">{similar.map(result => <MovieCard key={`${mediaType}-${result.id}`} item={result} compact isLiked={isLiked(result)} isSaved={isSaved(result)} onOpen={onOpen} onToggleLike={onToggleLike} onToggleWatchlist={onToggleWatchlist} />)}</div></section>}
      </article>
    </div>
  );
}
