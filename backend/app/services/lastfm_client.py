from __future__ import annotations

from typing import Any

import httpx


class LastFMError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


class LastFMClient:
    def __init__(self, api_key: str, base_url: str) -> None:
        self.api_key = api_key
        self.base_url = base_url

    async def get_top_tracks(self, user: str, limit: int = 25) -> list[dict[str, Any]]:
        params = {
            "method": "user.getTopTracks",
            "user": user,
            "api_key": self.api_key,
            "format": "json",
            "limit": str(limit),
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                payload = response.json()
        except httpx.TimeoutException as exc:
            raise LastFMError("Last.fm request timed out", status_code=504) from exc
        except httpx.HTTPStatusError as exc:
            raise LastFMError(
                f"Last.fm HTTP error: {exc.response.status_code}",
                status_code=502,
            ) from exc
        except httpx.HTTPError as exc:
            raise LastFMError("Failed to connect to Last.fm", status_code=502) from exc

        if not isinstance(payload, dict):
            raise LastFMError("Unexpected Last.fm response format", status_code=502)

        if "error" in payload:
            error_code = int(payload.get("error", 0))
            message = str(payload.get("message", "Unknown Last.fm error"))
            if error_code == 17:
                raise LastFMError(f"Last.fm user not found: {user}", status_code=404)
            if error_code in {6, 10, 13}:
                raise LastFMError(f"Last.fm request rejected: {message}", status_code=400)
            raise LastFMError(f"Last.fm error: {message}", status_code=502)

        toptracks = payload.get("toptracks", {}).get("track", [])
        if isinstance(toptracks, dict):
            toptracks = [toptracks]

        normalized: list[dict[str, Any]] = []
        for item in toptracks:
            artist = item.get("artist", {}).get("name", "")
            name = item.get("name", "")
            album = item.get("album", {}).get("name", "")
            playcount = int(item.get("playcount", 0)) if str(item.get("playcount", "0")).isdigit() else 0
            normalized.append(
                {
                    "artist": artist,
                    "title": name,
                    "album": album,
                    "playcount": playcount,
                }
            )

        return normalized
