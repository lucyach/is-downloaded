import { FormEvent, useState } from "react";
import { fetchCheckedTopTracks } from "./api";
import type { CheckedTrack } from "./types";

const DISMISSED_KEY = "dismissed_tracks";
const MY_USERNAME = "lucyacheson";
const SETTINGS_KEY = "hide_remasters";
const LIVE_SETTINGS_KEY = "hide_live";
const VERSION_SETTINGS_KEY = "hide_versions";
const FEAT_SETTINGS_KEY = "hide_features";

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

const VERSION_FILTER_HINTS = [
  "Extended / Original / Radio Version, Mix, or Edit",
  "Album / Single / Studio / Club / Demo Version, Mix, or Edit",
  "Acoustic / Instrumental / Unplugged / Vocal / Dub Mix or Version",
  "Deluxe / Special / Bonus / Rough / Promo Version or Mix",
  "[Year] Version, Mix, or Edit (e.g. 1987 Mix, (2001 Edit))",
  "(Version), (Mix), or (Edit) alone in parentheses",
] as const;

function isVersionVariant(title: string): boolean {
  return /\b(extended|original|radio|album|single|acoustic|alternate|alternative|demo|deluxe|club|full|long|short|studio|early|standard|special|official|unplugged|orchestral|piano|stripped|uncut|censored|clean|explicit|instrumental|electric|director|vocal|dub|dance|bonus|rough|promo|a\s*cappella|acapella)\s+(version|mix|edit)\b|\b(19|20)\d{2}\s+(version|mix|edit)\b|\((version|mix|edit)\)/i.test(title);
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

function loadDismissed(): Map<string, DismissedEntry> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as DismissedEntry[];
    return new Map(arr.map((t) => [dismissKey(t.artist, t.title), { ...t, reason: t.reason ?? "have_it" }]));
  } catch {
    return new Map();
  }
}

function saveDismissed(map: Map<string, DismissedEntry>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...map.values()]));
}

function loadHideRemasters(username: string): boolean {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved !== null) return saved === "true";
  return username === MY_USERNAME;
}

export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem("saved_user") ?? "");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<CheckedTrack[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalTracks, setTotalTracks] = useState(0);
  const [dismissed, setDismissed] = useState<Map<string, DismissedEntry>>(loadDismissed);
  const [showDismissed, setShowDismissed] = useState(false);
  const [hideRemasters, setHideRemasters] = useState(() => loadHideRemasters(user));
  const [hideLive, setHideLive] = useState(() => {
    const saved = localStorage.getItem(LIVE_SETTINGS_KEY);
    return saved !== null ? saved === "true" : false;
  });
  const [hideVersions, setHideVersions] = useState(() => {
    const saved = localStorage.getItem(VERSION_SETTINGS_KEY);
    return saved !== null ? saved === "true" : user === MY_USERNAME;
  });
  const [hideFeatures, setHideFeatures] = useState(() => {
    const saved = localStorage.getItem(FEAT_SETTINGS_KEY);
    return saved !== null ? saved === "true" : false;
  });

  function dismiss(track: CheckedTrack, reason: DismissReason) {
    const next = new Map(dismissed);
    next.set(dismissKey(track.artist, track.title), { ...track, reason });
    saveDismissed(next);
    setDismissed(next);
  }

  function undismiss(track: CheckedTrack) {
    const next = new Map(dismissed);
    next.delete(dismissKey(track.artist, track.title));
    saveDismissed(next);
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

  function toggleHideVersions(value: boolean) {
    setHideVersions(value);
    localStorage.setItem(VERSION_SETTINGS_KEY, String(value));
  }

  function toggleHideFeatures(value: boolean) {
    setHideFeatures(value);
    localStorage.setItem(FEAT_SETTINGS_KEY, String(value));
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
  }

  function handleAutofill(checked: boolean) {
    if (checked) handleUserChange(MY_USERNAME);
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
    if (hideVersions && isVersionVariant(t.title)) return false;
    if (hideFeatures && isFeatureTrack(t.title)) return false;
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

          <label className="setting-row">
            <input
              type="checkbox"
              checked={hideRemasters}
              onChange={(e) => toggleHideRemasters(e.target.checked)}
            />
            Hide remaster variants
          </label>
          <p className="setting-desc">
            When on, tracks labelled &ldquo;Remastered&rdquo; (any year) won&apos;t appear as missing.
          </p>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={hideLive}
              onChange={(e) => toggleHideLive(e.target.checked)}
            />
            Hide live variants
          </label>
          <ul className="filter-hints">
            {LIVE_FILTER_HINTS.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={hideVersions}
              onChange={(e) => toggleHideVersions(e.target.checked)}
            />
            Hide version variants
          </label>
          <ul className="filter-hints">
            {VERSION_FILTER_HINTS.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={hideFeatures}
              onChange={(e) => toggleHideFeatures(e.target.checked)}
            />
            Hide featured artist tracks
          </label>
          <ul className="filter-hints">
            {FEAT_FILTER_HINTS.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
