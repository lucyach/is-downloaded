import { FormEvent, useState } from "react";
import { fetchCheckedTopTracks } from "./api";
import type { CheckedTrack } from "./types";

const DISMISSED_KEY = "dismissed_tracks";
const MY_USERNAME = "lucyacheson";
const SETTINGS_KEY = "hide_remasters";
const LIVE_SETTINGS_KEY = "hide_live";
const VERSION_FILTERS_KEY = "version_filters";
const FEAT_SETTINGS_KEY = "hide_features";
const PARTIAL_ARTIST_SETTINGS_KEY = "hide_partial_artist";

function isRemasterVariant(title: string): boolean {
  // Matches any occurrence of "remaster" or "remastered" regardless of year
  return /\bremaster(ed)?\b/i.test(title);
}

const LIVE_FILTER_HINTS = [
  "(Live), (Live at …), (Live in Tokyo 1985)",
  "[Live], [Live at Wembley]",
  "Live at / Live in / Live from [place]",
  "Live Version, Live Recording, Live Session",
  "Titles ending with the word Live (e.g. Song – Live)",
] as const;

function isLiveVariant(title: string): boolean {
  return /\(live[^)]*\)|\[live[^\]]*\]|\blive\s+(at|in|from|version|recording|session)\b|\blive\s*$/i.test(title);
}

type VersionFilterKey = "extended" | "album" | "acoustic" | "deluxe" | "yearVersion" | "bareParens";

const VERSION_SUB_FILTERS: ReadonlyArray<{
  key: VersionFilterKey;
  label: string;
  test: (title: string) => boolean;
}> = [
  {
    key: "extended",
    label: "Extended / Original / Radio",
    test: (t) => /\b(extended|original|radio)\s+(version|mix|edit|track)\b/i.test(t),
  },
  {
    key: "album",
    label: "Album / Single / Studio / Club / Demo",
    test: (t) => /\b(album|single|studio|club|demo|alternate|alternative|early|standard|official|full|long|short)\s+(version|mix|edit|track)\b/i.test(t),
  },
  {
    key: "acoustic",
    label: "Acoustic / Instrumental / Vocal / Dub",
    test: (t) => /\b(acoustic|unplugged|orchestral|piano|stripped|electric|instrumental|vocal|dub|dance|a\s*cappella|acapella)\s+(version|mix|edit|track)\b/i.test(t),
  },
  {
    key: "deluxe",
    label: "Deluxe / Special / Bonus / Promo",
    test: (t) => /\b(deluxe|special|bonus|hidden|rough|promo|director|clean|explicit|uncut|censored)\s+(version|mix|edit|track)\b/i.test(t),
  },
  {
    key: "yearVersion",
    label: "[Year] Version, Mix, Edit, or Recording",
    test: (t) => /\b(19|20)\d{2}\s+(version|mix|edit|track|recording)\b|\brecording\s+(19|20)\d{2}\b/i.test(t),
  },
  {
    key: "bareParens",
    label: "(Version) / (Mix) / (Edit) in parentheses",
    test: (t) => /\((version|mix|edit|track)\)/i.test(t),
  },
];

const DEFAULT_VERSION_FILTERS: Record<VersionFilterKey, boolean> = {
  extended: false, album: false, acoustic: false, deluxe: false, yearVersion: false, bareParens: false,
};

function loadVersionFilters(): Record<VersionFilterKey, boolean> {
  try {
    const raw = localStorage.getItem(VERSION_FILTERS_KEY);
    if (raw) return { ...DEFAULT_VERSION_FILTERS, ...(JSON.parse(raw) as Record<VersionFilterKey, boolean>) };
  } catch {}
  return { ...DEFAULT_VERSION_FILTERS };
}

function saveVersionFilters(filters: Record<VersionFilterKey, boolean>) {
  localStorage.setItem(VERSION_FILTERS_KEY, JSON.stringify(filters));
}

const FEAT_FILTER_HINTS = [
  "(feat. Artist Name), feat. Artist Name",
  "(ft. Artist Name), ft. Artist Name",
  "(featuring Artist Name), featuring Artist Name",
  "feat / ft without a period",
  "(with Artist Name), [with Artist Name]",
] as const;

function isFeatureTrack(title: string): boolean {
  return /\bfeat[.\s]|\bft[.\s]|\bfeaturing\b|\(with\b|\[with\b/i.test(title);
}

type DismissReason = "have_it" | "dont_want";
type DismissedEntry = CheckedTrack & { reason: DismissReason };

function dismissKey(artist: string, title: string) {
  return `${artist.toLowerCase()}::${title.toLowerCase()}`;
}

function loadDismissed(username: string): Map<string, DismissedEntry> {
  if (!username) return new Map();
  const userKey = `${DISMISSED_KEY}:${username}`;
  try {
    const raw = localStorage.getItem(userKey);
    if (raw) {
      const arr = JSON.parse(raw) as DismissedEntry[];
      return new Map(arr.map((t) => [dismissKey(t.artist, t.title), { ...t, reason: t.reason ?? "have_it" }]));
    }
    // Migrate data from the old unscoped key on first load for this user.
    const legacy = localStorage.getItem(DISMISSED_KEY);
    if (legacy) {
      localStorage.setItem(userKey, legacy);
      localStorage.removeItem(DISMISSED_KEY);
      const arr = JSON.parse(legacy) as DismissedEntry[];
      return new Map(arr.map((t) => [dismissKey(t.artist, t.title), { ...t, reason: t.reason ?? "have_it" }]));
    }
  } catch {}
  return new Map();
}

function saveDismissed(username: string, map: Map<string, DismissedEntry>) {
  if (!username) return;
  localStorage.setItem(`${DISMISSED_KEY}:${username}`, JSON.stringify([...map.values()]));
}

function loadHideRemasters(): boolean {
  return localStorage.getItem(SETTINGS_KEY) === "true";
}

export default function App() {
  const [user, setUser] = useState("");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<CheckedTrack[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalTracks, setTotalTracks] = useState(0);
  const [dismissed, setDismissed] = useState<Map<string, DismissedEntry>>(new Map());
  const [showDismissed, setShowDismissed] = useState(false);
  const [hideRemasters, setHideRemasters] = useState(() => loadHideRemasters());
  const [hideLive, setHideLive] = useState(() => localStorage.getItem(LIVE_SETTINGS_KEY) === "true");
  const [versionFilters, setVersionFilters] = useState<Record<VersionFilterKey, boolean>>(() => loadVersionFilters());
  const [hideFeatures, setHideFeatures] = useState(() => localStorage.getItem(FEAT_SETTINGS_KEY) === "true");
  const [hidePartialArtist, setHidePartialArtist] = useState(() => localStorage.getItem(PARTIAL_ARTIST_SETTINGS_KEY) === "true");

  function dismiss(track: CheckedTrack, reason: DismissReason) {
    const next = new Map(dismissed);
    next.set(dismissKey(track.artist, track.title), { ...track, reason });
    saveDismissed(user, next);
    setDismissed(next);
  }

  function undismiss(track: CheckedTrack) {
    const next = new Map(dismissed);
    next.delete(dismissKey(track.artist, track.title));
    saveDismissed(user, next);
    setDismissed(next);
  }

  function toggleHideRemasters(value: boolean) {
    setHideRemasters(value);
    localStorage.setItem(SETTINGS_KEY, String(value));
  }

  function toggleHideLive(value: boolean) {
    setHideLive(value);
    localStorage.setItem(LIVE_SETTINGS_KEY, String(value));
  }

  function toggleVersionFilter(key: VersionFilterKey, value: boolean) {
    const next = { ...versionFilters, [key]: value };
    setVersionFilters(next);
    saveVersionFilters(next);
  }

  function toggleHideFeatures(value: boolean) {
    setHideFeatures(value);
    localStorage.setItem(FEAT_SETTINGS_KEY, String(value));
  }

  function toggleHidePartialArtist(value: boolean) {
    setHidePartialArtist(value);
    localStorage.setItem(PARTIAL_ARTIST_SETTINGS_KEY, String(value));
  }

  async function loadPage(targetPage: number, append: boolean) {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchCheckedTopTracks(user, limit, targetPage);
      setTracks(append ? (prev) => [...prev, ...data.results] : data.results);
      setPage(data.page);
      setTotalPages(data.total_pages);
      setTotalTracks(data.total_tracks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleUserChange(value: string) {
    setUser(value);
    localStorage.setItem("saved_user", value);
    setDismissed(loadDismissed(value));
  }

  function handleAutofill(checked: boolean) {
    if (!checked) return;
    handleUserChange(MY_USERNAME);
    const allOn: Record<VersionFilterKey, boolean> = { extended: true, album: true, acoustic: true, deluxe: true, yearVersion: true, bareParens: true };
    setHideRemasters(true);       localStorage.setItem(SETTINGS_KEY, "true");
    setHideLive(false);           localStorage.setItem(LIVE_SETTINGS_KEY, "false");
    setVersionFilters(allOn);     saveVersionFilters(allOn);
    setHideFeatures(true);        localStorage.setItem(FEAT_SETTINGS_KEY, "true");
    setHidePartialArtist(true);   localStorage.setItem(PARTIAL_ARTIST_SETTINGS_KEY, "true");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTracks([]);
    setPage(0);
    setTotalPages(0);
    await loadPage(1, false);
  }

  async function onLoadMore() {
    await loadPage(page + 1, true);
  }

  const visibleTracks = tracks.filter((t) => {
    if (dismissed.has(dismissKey(t.artist, t.title))) return false;
    if (hideRemasters && isRemasterVariant(t.title)) return false;
    if (hideLive && isLiveVariant(t.title)) return false;
    if (VERSION_SUB_FILTERS.some((f) => versionFilters[f.key] && f.test(t.title))) return false;
    if (hideFeatures && isFeatureTrack(t.title)) return false;
    if (hidePartialArtist && t.artist_partial_match) return false;
    return true;
  });
  const dismissedList = [...dismissed.values()];

  return (
    <div className="layout">
      <aside className="sidebar">
        <label className="autofill-check">
          <input
            type="checkbox"
            checked={user === MY_USERNAME}
            onChange={(e) => handleAutofill(e.target.checked)}
          />
          Use my account (lucyacheson)
        </label>

        <section className="dismissed-panel">
          <h2>
            Dismissed ({dismissedList.length}){" "}
            <button className="btn-toggle" onClick={() => setShowDismissed((v) => !v)}>
              {showDismissed ? "▲" : "▼"}
            </button>
          </h2>
          {showDismissed && (
            <ul className="results dismissed-results">
              {dismissedList.length === 0 && <li className="empty-note">Nothing dismissed yet.</li>}
              {dismissedList.map((track) => (
                <li key={`dismissed-${track.artist}-${track.title}`}>
                  <div className="dismissed-header">
                    <strong>{track.title}</strong>
                    <span className={`dismiss-reason-badge ${track.reason === "have_it" ? "badge-have-it" : "badge-skip"}`}>
                      {track.reason === "have_it" ? "✓ have it" : "✕ skip"}
                    </span>
                  </div>
                  <div className="meta">{track.artist}</div>
                  <button className="btn-restore" onClick={() => undismiss(track)}>restore</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <main className="main-content">
        <h1>Is Downloaded?</h1>
        <p>By Lucy Acheson 2026.</p>

        <form onSubmit={onSubmit} className="controls">
          <label>
            Last.fm user
            <input value={user} onChange={(e) => handleUserChange(e.target.value)} required />
          </label>

          <label>
            Per page
            <input
              type="number"
              min={1}
              max={1000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </label>

          <button disabled={loading} type="submit">
            {loading ? "Checking..." : "Check tracks"}
          </button>
        </form>

        {error && <p className="error">{error}</p>}

        {totalTracks > 0 && (
          <p className="status-line">
            Page {page} of {totalPages} &mdash; {totalTracks.toLocaleString()} total scrobbles &mdash; {visibleTracks.length} missing shown
          </p>
        )}

        <section>
          <h2>Missing Tracks ({visibleTracks.length})</h2>
          <ul className="results">
            {visibleTracks.map((track) => (
              <li key={`${track.artist}-${track.title}-${track.playcount}`} className="miss">
                <div><strong>{track.title}</strong></div>
                <div className="meta">{track.artist} &mdash; {track.album || "Unknown album"}</div>
                <div className="meta">Plays: {track.playcount}</div>
                <div className="card-actions">
                  <button className="btn-have-it" onClick={() => dismiss(track, "have_it")}>✓ Already Downloaded</button>
                  <button className="btn-skip" onClick={() => dismiss(track, "dont_want")}>✕ Not Interested</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {page > 0 && page < totalPages && (
          <button className="btn-load-more" disabled={loading} onClick={onLoadMore}>
            {loading ? "Loading..." : `Load more (page ${page + 1} of ${totalPages})`}
          </button>
        )}
      </main>

      <aside className="settings-sidebar">
        <section className="settings-section">
          <h2>Preferences</h2>

          <div className="setting-item">
            <label className="setting-row">
              <input
                type="checkbox"
                checked={hideRemasters}
                onChange={(e) => toggleHideRemasters(e.target.checked)}
              />
              <span>Hide remaster variants</span>
            </label>
            <p className="setting-desc">
              When on, tracks labelled &ldquo;Remastered&rdquo; (any year) won&apos;t appear as missing.
            </p>
          </div>

          <div className="setting-item">
            <label className="setting-row">
              <input
                type="checkbox"
                checked={hideLive}
                onChange={(e) => toggleHideLive(e.target.checked)}
              />
              <span>Hide live variants</span>
            </label>
            <ul className="filter-hints">
              {LIVE_FILTER_HINTS.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>

          <div className="setting-item">
            <div className="setting-subsection-title">Version Variants</div>
            {VERSION_SUB_FILTERS.map(({ key, label }) => (
              <label key={key} className="setting-row setting-row-sub">
                <input
                  type="checkbox"
                  checked={versionFilters[key]}
                  onChange={(e) => toggleVersionFilter(key, e.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="setting-item">
            <label className="setting-row">
              <input
                type="checkbox"
                checked={hideFeatures}
                onChange={(e) => toggleHideFeatures(e.target.checked)}
              />
              <span>Hide featured artist tracks</span>
            </label>
            <ul className="filter-hints">
              {FEAT_FILTER_HINTS.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>

          <div className="setting-item">
            <label className="setting-row">
              <input
                type="checkbox"
                checked={hidePartialArtist}
                onChange={(e) => toggleHidePartialArtist(e.target.checked)}
              />
              <span>Hide partial artist matches</span>
            </label>
            <p className="setting-desc">
              Hides tracks where one artist name contains the other (e.g. &ldquo;The Wailers&rdquo; vs &ldquo;Bob Marley &amp; The Wailers&rdquo;, or &ldquo;Louis Cole&rdquo; vs a multi-artist credit).
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}
