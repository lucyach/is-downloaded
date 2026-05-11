from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.services.lastfm_client import LastFMClient, LastFMError
from app.services.metadata_matcher import TrackIndex

load_dotenv()

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
    limit: int = Query(25, ge=1, le=100),
) -> dict[str, object]:
    if not LASTFM_API_KEY:
        raise HTTPException(status_code=500, detail="LASTFM_API_KEY is not configured")

    try:
        client = LastFMClient(api_key=LASTFM_API_KEY, base_url=LASTFM_BASE_URL)
        tracks = await client.get_top_tracks(user=user, limit=limit)
    except LastFMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return {"user": user, "tracks": tracks}


@app.post("/api/check-track", response_model=TrackStatus)
def check_track_downloaded(payload: TrackRequest) -> TrackStatus:
    track_index.refresh_if_path_changed(MUSIC_LIBRARY_PATH)
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
    limit: int = Query(25, ge=1, le=100),
    only_missing: bool = Query(True, description="Return only tracks not found in library"),
) -> dict[str, object]:
    if not LASTFM_API_KEY:
        raise HTTPException(status_code=500, detail="LASTFM_API_KEY is not configured")

    try:
        client = LastFMClient(api_key=LASTFM_API_KEY, base_url=LASTFM_BASE_URL)
        tracks = await client.get_top_tracks(user=user, limit=limit)
    except LastFMError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    track_index.refresh_if_path_changed(MUSIC_LIBRARY_PATH)

    results: list[TrackStatus] = []
    for track in tracks:
        artist = track.get("artist", "")
        title = track.get("title", "")
        album = track.get("album", "")
        playcount = int(track.get("playcount", 0))
        matched_path = track_index.find_track(artist, title)
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
            )
        )

    return {
        "user": user,
        "total": len(results),
        "results": [result.model_dump() for result in results],
    }
