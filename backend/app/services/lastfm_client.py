from __future__ import annotations

import asyncio
from typing import Any

import httpx


class LastFMError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


class LastFMClient:
    _album_cache: dict[tuple[str, str], str] = {}

    def __init__(self, api_key: str, base_url: str) -> None:
        self.api_key = api_key
        self.base_url = base_url

    @staticmethod
    def _cache_key(artist: str, title: str) -> tuple[str, str]:
        artist_key = " ".join(artist.strip().lower().split())
        title_key = " ".join(title.strip().lower().split())
        return artist_key, title_key

    @staticmethod
    def _extract_album_title(payload: dict[str, Any]) -> str:
        track_info = payload.get("track", {})
        if not isinstance(track_info, dict):
            return ""

        album_info = track_info.get("album", {})
        if not isinstance(album_info, dict):
            return ""

        # Last.fm payloads can expose album text under different keys.
        for key in ("title", "name", "#text"):
            value = album_info.get(key, "")
            if isinstance(value, str) and value.strip():
                return value.strip()

        return ""

    async def _get_track_album(
        self,
        client: httpx.AsyncClient,
        artist: str,
        title: str,
        mbid: str,
        semaphore: asyncio.Semaphore,
    ) -> str:
        cache_key = self._cache_key(artist, title)
        if cache_key in self._album_cache:
            return self._album_cache[cache_key]

        params_list: list[dict[str, str]] = []
        if mbid.strip():
            params_list.append(
                {
                    "method": "track.getInfo",
                    "mbid": mbid,
                    "api_key": self.api_key,
                    "format": "json",
                    "autocorrect": "1",
                }
            )
        params_list.append(
            {
                "method": "track.getInfo",
                "artist": artist,
                "track": title,
                "api_key": self.api_key,
                "format": "json",
                "autocorrect": "1",
            }
        )

        album_title = ""
        async with semaphore:
            try:
                for params in params_list:
                    response = await client.get(self.base_url, params=params)
                    response.raise_for_status()
                    payload = response.json()
                    if not isinstance(payload, dict):
                        continue
                    if "error" in payload:
                        continue
                    album_title = self._extract_album_title(payload)
                    if album_title:
                        break
            except Exception:
                self._album_cache[cache_key] = ""
                return ""

        self._album_cache[cache_key] = album_title
        return album_title

    async def _enrich_albums(
        self,
        client: httpx.AsyncClient,
        tracks: list[dict[str, Any]],
    ) -> None:
        semaphore = asyncio.Semaphore(8)
        tasks: list[asyncio.Task[str]] = []
        indexes: list[int] = []

        for index, track in enumerate(tracks):
            if track.get("album"):
                continue
            artist = str(track.get("artist", ""))
            title = str(track.get("title", ""))
            mbid = str(track.get("mbid", ""))
            if not artist or not title:
                continue
            indexes.append(index)
            tasks.append(
                asyncio.create_task(
                    self._get_track_album(
                        client,
                        artist=artist,
                        title=title,
                        mbid=mbid,
                        semaphore=semaphore,
                    )
                )
            )

        if not tasks:
            return

        album_results = await asyncio.gather(*tasks)
        for index, album in zip(indexes, album_results, strict=True):
            tracks[index]["album"] = album

    async def get_top_tracks(
        self,
        user: str,
        limit: int = 50,
        page: int = 1,
    ) -> dict[str, Any]:
        params = {
            "method": "user.getTopTracks",
            "user": user,
            "api_key": self.api_key,
            "format": "json",
            "limit": str(limit),
            "page": str(page),
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

        toptracks_block = payload.get("toptracks", {})
        attr = toptracks_block.get("@attr", {})
        total_pages = int(attr.get("totalPages", 1))
        total_tracks = int(attr.get("total", 0))
        current_page = int(attr.get("page", page))

        raw_tracks = toptracks_block.get("track", [])
        if isinstance(raw_tracks, dict):
            raw_tracks = [raw_tracks]

        normalized: list[dict[str, Any]] = []
        for item in raw_tracks:
            artist = item.get("artist", {}).get("name", "")
            name = item.get("name", "")
            album = item.get("album", {}).get("name", "")
            mbid = item.get("mbid", "")
            playcount = int(item.get("playcount", 0)) if str(item.get("playcount", "0")).isdigit() else 0
            normalized.append(
                {
                    "artist": artist,
                    "title": name,
                    "album": album,
                    "mbid": mbid,
                    "playcount": playcount,
                }
            )

        # user.getTopTracks usually does not include album, so enrich with track.getInfo.
        async with httpx.AsyncClient(timeout=15.0) as client:
            await self._enrich_albums(client, normalized)

        return {
            "tracks": normalized,
            "page": current_page,
            "total_pages": total_pages,
            "total_tracks": total_tracks,
            "per_page": limit,
        }
