import { FormEvent, useState } from "react";
import { fetchCheckedTopTracks } from "./api";
import type { CheckedTrack } from "./types";

export default function App() {
  const [user, setUser] = useState("");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<CheckedTrack[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalTracks, setTotalTracks] = useState(0);

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

  return (
    <main className="page">
      <h1>Is Downloaded?</h1>
      <p>Find which of your most-played Last.fm tracks are missing from your local library.</p>

      <form onSubmit={onSubmit} className="controls">
        <label>
          Last.fm user
          <input value={user} onChange={(e) => setUser(e.target.value)} required />
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
          Showing page {page} of {totalPages} ({totalTracks.toLocaleString()} total scrobbled tracks) — {tracks.length} missing shown
        </p>
      )}

      <section>
        <h2>Missing Tracks ({tracks.length})</h2>
        <ul className="results">
          {tracks.map((track) => (
            <li key={`${track.artist}-${track.title}-${track.playcount}`} className="miss">
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
    </main>
  );
}
