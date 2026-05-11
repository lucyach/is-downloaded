import type { CheckTopTracksResponse } from "./types";

export async function fetchCheckedTopTracks(user: string, limit: number): Promise<CheckTopTracksResponse> {
  const query = new URLSearchParams({ user, limit: String(limit), only_missing: "true" });
  const response = await fetch(`/api/check-top-tracks?${query.toString()}`);

  if (!response.ok) {
    const rawBody = await response.text();
    let detail = "";

    try {
      const body = JSON.parse(rawBody) as { detail?: string };
      detail = body.detail ?? rawBody;
    } catch {
      detail = rawBody;
    }

    throw new Error(detail || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as CheckTopTracksResponse;
}
