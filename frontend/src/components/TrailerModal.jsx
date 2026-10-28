export default function TrailerModal({ videoKey, onClose }) {
  if (!videoKey) return null;
  return (
    <div className="trailer-modal is-open fixed inset-0 z-[110] grid place-items-center p-3" aria-hidden="false" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="trailer-backdrop absolute inset-0" />
      <section className="trailer-content relative z-10 w-full max-w-5xl" role="dialog" aria-modal="true" aria-label="Movie trailer">
        <button type="button" className="trailer-close" aria-label="Close trailer" onClick={onClose}>×</button>
        <div className="trailer-frame-wrap aspect-video w-full overflow-hidden rounded-xl">
          <iframe title="CineFind trailer" className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoKey)}?autoplay=1&rel=0`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        </div>
      </section>
    </div>
  );
}
