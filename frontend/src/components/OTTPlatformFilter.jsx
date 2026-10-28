import { useState } from "react";
import { TMDB_PROVIDER_IMAGE } from "../services/tmdb";

const FEATURED_NAMES = ["netflix", "amazon prime video", "jiohotstar", "hotstar", "zee5", "sony liv"];

function popularityOrder(provider) {
  const name = String(provider.provider_name || "").toLowerCase();
  const index = FEATURED_NAMES.findIndex(featured => name.includes(featured));
  return index < 0 ? FEATURED_NAMES.length : index;
}

export default function OTTPlatformFilter({ providers, selectedId, onSelect, loading, error, onRetry }) {
  const sorted = [...providers].sort((left, right) => popularityOrder(left) - popularityOrder(right)
    || String(left.provider_name).localeCompare(String(right.provider_name)));
  const featured = sorted.slice(0, 6);
  const [showAll, setShowAll] = useState(false);

  return (
    <section className="ott-filter-section discovery-ott" aria-label="Filter by OTT platform">
      <div className="ott-filter-heading">
        <div><h2>Filter by OTT Platform</h2><p>Streaming availability in India</p></div>
        <span className="ott-filter-status" aria-live="polite">{loading ? "Loading platforms…" : error ? "Platforms unavailable" : `${providers.length} platforms`}</span>
      </div>
      {error ? <div className="ott-provider-error" role="status"><span>{error}</span><button type="button" onClick={onRetry}>Retry</button></div>
        : <>
          <div className="ott-provider-filters" aria-label="OTT platform filters">
            <button type="button" className={`ott-filter-button ott-all-button ${!selectedId ? "is-selected" : ""}`} aria-pressed={!selectedId} onClick={() => onSelect("")}>All Platforms</button>
            {(showAll ? sorted : featured).map(provider => <button type="button" key={provider.provider_id}
              className={`ott-filter-button ${String(selectedId) === String(provider.provider_id) ? "is-selected" : ""}`}
              aria-pressed={String(selectedId) === String(provider.provider_id)} title={provider.provider_name}
              onClick={() => onSelect(String(provider.provider_id))}>
              {provider.logo_path ? <img src={`${TMDB_PROVIDER_IMAGE}${provider.logo_path}`} alt="" loading="lazy" /> : <span className="ott-provider-icon" aria-hidden="true">▶</span>}
              <span>{provider.provider_name}</span>
            </button>)}
          </div>
          {sorted.length > featured.length && <button type="button" className="ott-show-all" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? "Show Less" : "Show All"}</button>}
        </>}
    </section>
  );
}

