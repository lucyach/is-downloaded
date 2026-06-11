import { FormEvent, useState } from "react";
import { fetchCheckedTopTracks } from "./api";
import type { CheckedTrack } from "./types";

const DISMISSED_KEY = "dismissed_tracks";
const MY_USERNAME = "lucyacheson";

function dismissKey(artist: string, title: string) {
  return `${artist.toLowerCase()}::${title.toLowerCase()}`;
}

function loadDismissed(): Map<string, CheckedTrack> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as CheckedTrack[];
    return new Map(arr.map((t) => [dismissKey(t.artist, t.title), t]));
  } catch {
    return new Map();
  }
}

function saveDismissed(map: Map<string, CheckedTrack>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...map.values()]));
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
  const [dismissed, setDismissed] = useState<Map<string, CheckedTrack>>(loadDismissed);
  const [showDismissed, setShowDismissed] = useState(false);

  function dismiss(track: CheckedTrack) {
    const next = new Map(dismissed);
    next.set(dismissKey(track.artist, track.title), track);
    saveDismissed(next);
    setDismissed(next);
  }

  function undismiss(track: CheckedTrack) {
    const next = new Map(dismissed);
    next.delete(dismissKey(track.artist, track.title));
    saveDismissed(next);
    setDismissed(next);
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

  const visibleTracks = tracks.filter(
    (t) => !dismissed.has(dismissKey(t.artist, t.title)),
  );
  const dismissedList = [...dismissed.values()];

  return (
    <main className="page">
      <label className="autofill-check">
        <input
          type="checkbox"
          checked={user === MY_USERNAME}
          onChange={(e) => handleAutofill(e.target.checked)}
        />
        Use my account ({MY_USERNAME})
      </label>

      <h1>Is Downloaded?</h1>
      <p>Find which of your most-played Last.fm tracks are missing from your local library.</p>

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
        <p>
          Showing page {page} of {totalPages} ({totalTracks.toLocaleString()} total scrobbled tracks) &mdash; {visibleTracks.length} missing shown
        </p>
      )}

      <section>
        <h2>Missing Tracks ({visibleTracks.length})</h2>
        <ul className="results">
          {visibleTracks.map((track) => (
            <li key={`${track.artist}-${track.title}-${track.playcount}`} className="miss">
              <button className="dismiss-x" onClick={() => dismiss(track)} title="Dismiss">&times;</button>
              <div>
                <strong>{track.title}</strong>
              </div>
              <div>Artist: {track.artist}</div>
              <div>Album: {track.album || "Unknown album"}</div>
              <div>Plays: {track.playcount}</div>
            </li>
          ))}
        </ul>
      </section>

      {page > 0 && page < totalPages && (
        <button disabled={loading} onClick={onLoadMore}>
          {loading ? "Loading..." : `Load more (page ${page + 1} of ${totalPages})`}
        </button>
      )}

      <section>
        <h2>
          Dismissed ({dismissedList.length}){" "}
          <button onClick={() => setShowDismissed((v) => !v)}>
            {showDismissed ? "Hide" : "Show"}
          </button>
        </h2>
        {showDismissed && (
          <ul className="results">
            {dismissedList.length === 0 && <li>No dismissed tracks.</li>}
            {dismissedList.map((track) => (
              <li key={`dismissed-${track.artist}-${track.title}`} className="miss">
                <div>
                  <strong>{track.title}</strong>
                </div>
                <div>Artist: {track.artist}</div>
                <div>Album: {track.album || "Unknown album"}</div>
                <div>Plays: {track.playcount}</div>
                <button onClick={() => undismiss(track)}>Restore</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
