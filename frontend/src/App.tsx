import { FormEvent, useState } from "react";
import { fetchCheckedTopTracks } from "./api";
import type { CheckedTrack } from "./types";

export default function App() {
  const [user, setUser] = useState("");
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<CheckedTrack[]>([]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await fetchCheckedTopTracks(user, limit);
      setTracks(data.results);
    } catch (err) {
      setTracks([]);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
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
          Track limit
          <input
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </label>

        <button disabled={loading} type="submit">
          {loading ? "Checking..." : "Check tracks"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <section>
        <h2>Missing Tracks ({tracks.length})</h2>
        <ul className="results">
          {tracks.map((track) => (
            <li key={`${track.artist}-${track.title}`} className="miss">
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
    </main>
  );
}
