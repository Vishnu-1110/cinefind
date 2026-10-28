import { TMDB_IMAGE, titleFor, dateFor } from "../services/tmdb";

export default function MovieCard({ item, isLiked, isSaved, onOpen, onToggleLike, onToggleWatchlist, compact = false }) {
  const poster = item.poster_path ? `${TMDB_IMAGE}${item.poster_path}` : "";
  const year = dateFor(item)?.slice(0, 4);
  const rating = Number(item.vote_average);
  const hasRating = Number.isFinite(rating) && rating > 0;
  const runtime = Number(item.runtime_minutes);
  return (
    <article className={`movie-card group ${compact ? "movie-card-compact" : ""}`}>
      <button type="button" className="card-open-button" onClick={() => onOpen(item)} aria-label={`Open details for ${titleFor(item)}`}>
        {poster ? <img src={poster} alt={`${titleFor(item)} poster`} loading="lazy" decoding="async" width="342" height="513" /> : <div className="poster-fallback" role="img" aria-label="Poster unavailable"><span aria-hidden="true">🎬</span><span>Poster unavailable</span></div>}
      </button>
      <div className="movie-info">
        <div className="card-title-row"><h3><button type="button" className="title-link" onClick={() => onOpen(item)} title={titleFor(item)}>{titleFor(item)}</button></h3><span className="media-type-badge">{item.media_type === "tv" ? "TV" : "Film"}</span></div>
        <p className="card-metadata">{year && <span>{year}</span>}{hasRating && <span aria-label={`Rating ${rating.toFixed(1)} out of 10`}>★ {rating.toFixed(1)}</span>}{Number.isFinite(runtime) && runtime > 0 && <span>{runtime} min</span>}</p>
        <div className="card-actions flex flex-wrap gap-2">
          <button type="button" className={`like-btn ${isLiked ? "is-liked" : ""}`} aria-label={isLiked ? `Unlike ${titleFor(item)}` : `Like ${titleFor(item)}`} aria-pressed={isLiked} onClick={event => { event.stopPropagation(); onToggleLike(item); }}>{isLiked ? "♥ Liked" : "♡ Like"}</button>
          <button type="button" className={`watchlist-btn ${isSaved ? "watchlist-btn-added" : "watchlist-btn-add"}`} aria-label={isSaved ? `Remove ${titleFor(item)} from Watchlist` : `Add ${titleFor(item)} to Watchlist`} aria-pressed={isSaved} onClick={event => { event.stopPropagation(); onToggleWatchlist(item); }}>{isSaved ? "✓ In Watchlist" : "+ Watchlist"}</button>
        </div>
      </div>
    </article>
  );
}
