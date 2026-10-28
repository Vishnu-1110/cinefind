import { useId, useRef } from "react";
import MovieCard from "./MovieCard";

export default function ContentCarousel({
  title,
  items = [],
  isLiked,
  isSaved,
  onOpen,
  onToggleLike,
  onToggleWatchlist,
  loading = false,
  error = "",
  emptyMessage = "No titles to show yet.",
}) {
  const trackRef = useRef(null);
  const headingId = useId();

  function scroll(direction) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.82, 280), behavior: "smooth" });
  }

  return (
    <section className="content-carousel" aria-labelledby={headingId}>
      <div className="content-carousel-heading">
        <h2 id={headingId}>{title}</h2>
        <div className="carousel-controls">
          <button type="button" aria-label={`Scroll ${title} left`} onClick={() => scroll(-1)}>‹</button>
          <button type="button" aria-label={`Scroll ${title} right`} onClick={() => scroll(1)}>›</button>
        </div>
      </div>
      {error ? <p className="carousel-message" role="status">{error}</p>
        : loading && !items.length ? <p className="carousel-message" aria-live="polite">Loading titles…</p>
          : items.length ? <div className="content-carousel-track" ref={trackRef} tabIndex="0" aria-label={`${title} titles`}>
            {items.map(item => <MovieCard key={`${item.media_type || "movie"}:${item.id}`} item={item}
              isLiked={isLiked(item)} isSaved={isSaved(item)} onOpen={onOpen}
              onToggleLike={onToggleLike} onToggleWatchlist={onToggleWatchlist} />)}
          </div>
            : <p className="carousel-message">{emptyMessage}</p>}
    </section>
  );
}
