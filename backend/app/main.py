from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.services.lastfm_client import LastFMClient, LastFMError
from app.services.metadata_matcher import TrackIndex

# Resolve .env relative to this file so it's found regardless of cwd.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

LASTFM_API_KEY = os.getenv("LASTFM_API_KEY", "")
LASTFM_BASE_URL = os.getenv("LASTFM_BASE_URL", "https://ws.audioscrobbler.com/2.0/")
MUSIC_LIBRARY_PATH = os.getenv("MUSIC_LIBRARY_PATH", "")

track_index = TrackIndex()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if MUSIC_LIBRARY_PATH:
        track_index.build(MUSIC_LIBRARY_PATH)
    else:
        track_index.build("")
    yield


app = FastAPI(title="is-downloaded API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TrackRequest(BaseModel):
    artist: str
    title: str
    album: str | None = None


class TrackStatus(BaseModel):
    artist: str
    title: str
    album: str | None = None
    playcount: int | None = None
    downloaded: bool
    matched_path: str | None = None
    artist_partial_match: bool = False


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "index_ready": track_index.is_ready,
        "indexed_tracks": track_index.track_count,
    }


@app.get("/api/top-tracks")
async def get_top_tracks(
    user: str = Query(..., description="Last.fm username"),
    limit: int = Query(50, ge=1, le=1000),
    page: int = Query(1, ge=1),
) -> dict[str, object]:
    if not LASTFM_API_KEY:
        raise HTTPException(status_code=500, detail="LASTFM_API_KEY is not configured")

    try:
        client = LastFMClient(api_key=LASTFM_API_KEY, base_url=LASTFM_BASE_URL)
        result = await client.get_top_tracks(user=user, limit=limit, page=page)
    except LastFMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return {"user": user, **result}


@app.post("/api/check-track", response_model=TrackStatus)
def check_track_downloaded(payload: TrackRequest) -> TrackStatus:
    track_index.refresh_if_stale(MUSIC_LIBRARY_PATH)
    matched_path = track_index.find_track(payload.artist, payload.title)
    return TrackStatus(
        artist=payload.artist,
        title=payload.title,
        album=payload.album,
        downloaded=matched_path is not None,
        matched_path=matched_path,
    )


@app.get("/api/check-top-tracks")
async def check_top_tracks(
    user: str = Query(..., description="Last.fm username"),
    limit: int = Query(50, ge=1, le=1000),
    page: int = Query(1, ge=1),
    only_missing: bool = Query(True, description="Return only tracks not found in library"),
) -> dict[str, object]:
    if not LASTFM_API_KEY:
        raise HTTPException(status_code=500, detail="LASTFM_API_KEY is not configured")

    try:
        client = LastFMClient(api_key=LASTFM_API_KEY, base_url=LASTFM_BASE_URL)
        result = await client.get_top_tracks(user=user, limit=limit, page=page)
    except LastFMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    track_index.refresh_if_stale(MUSIC_LIBRARY_PATH)

    results: list[TrackStatus] = []
    for track in result["tracks"]:
        artist = track.get("artist", "")
        title = track.get("title", "")
        album = track.get("album", "")
        playcount = int(track.get("playcount", 0))
        matched_path = track_index.find_track(artist, title)
        artist_partial_match = False
        if matched_path is None:
            if track_index.find_track_partial_artist(artist, title) is not None:
                artist_partial_match = True
        downloaded = matched_path is not None

        if only_missing and downloaded:
            continue

        results.append(
            TrackStatus(
                artist=artist,
                title=title,
                album=album,
                playcount=playcount,
                downloaded=downloaded,
                matched_path=matched_path,
                artist_partial_match=artist_partial_match,
            )
        )

    return {
        "user": user,
        "page": result["page"],
        "total_pages": result["total_pages"],
        "total_tracks": result["total_tracks"],
        "per_page": result["per_page"],
        "total": len(results),
        "results": [r.model_dump() for r in results],
    }
