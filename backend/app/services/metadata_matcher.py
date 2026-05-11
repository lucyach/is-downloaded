from __future__ import annotations

import os
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from threading import Lock

from mutagen.easyid3 import EasyID3


def _normalize(text: str) -> str:
    text = text.strip().lower().replace("&", " and ")
    text = re.sub(r"[\[\]{}()]+", " ", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return " ".join(text.split())


def _strip_feature_tokens(text: str) -> str:
    text = re.sub(r"\b(feat|ft|featuring)\b\.?\s+.*$", "", text, flags=re.IGNORECASE)
    return text


def _strip_title_variants(text: str) -> str:
    # Remove common version tags to improve fuzzy matching against local tags.
    text = re.sub(
        r"\b(remaster(ed)?|remix|mix|live|version|edit|mono|stereo|instrumental)\b",
        "",
        text,
        flags=re.IGNORECASE,
    )
    return text


def _canonical_artist(artist: str) -> str:
    return _normalize(_strip_feature_tokens(artist))


def _canonical_title(title: str) -> str:
    title = _strip_feature_tokens(title)
    title = _strip_title_variants(title)
    return _normalize(title)


def _safe_first(values: list[str] | None) -> str:
    if not values:
        return ""
    return values[0]


@dataclass(frozen=True)
class IndexedTrack:
    raw_artist_key: str
    raw_title_key: str
    artist_key: str
    title_key: str
    filename_key: str
    path: str


class TrackIndex:
    def __init__(self) -> None:
        self._lock = Lock()
        self._tracks: list[IndexedTrack] = []
        self._by_artist: dict[str, list[IndexedTrack]] = {}
        self._exact_map: dict[tuple[str, str], str] = {}
        self._raw_exact_map: dict[tuple[str, str], str] = {}
        self._library_path: str = ""
        self._is_ready = False

    @property
    def is_ready(self) -> bool:
        return self._is_ready

    @property
    def track_count(self) -> int:
        return len(self._tracks)

    def build(self, library_path: str) -> None:
        tracks: list[IndexedTrack] = []
        by_artist: dict[str, list[IndexedTrack]] = {}
        exact_map: dict[tuple[str, str], str] = {}
        raw_exact_map: dict[tuple[str, str], str] = {}

        root = Path(library_path)
        if not root.exists() or not root.is_dir():
            with self._lock:
                self._tracks = []
                self._by_artist = {}
                self._exact_map = {}
                self._raw_exact_map = {}
                self._library_path = library_path
                self._is_ready = True
            return

        for dirpath, _, filenames in os.walk(root):
            for filename in filenames:
                if not filename.lower().endswith(".mp3"):
                    continue

                file_path = Path(dirpath) / filename
                try:
                    tags = EasyID3(str(file_path))
                except Exception:
                    tags = None

                raw_artist = ""
                raw_title = ""
                if tags is not None:
                    raw_artist = (
                        _safe_first(tags.get("artist"))
                        or _safe_first(tags.get("albumartist"))
                        or _safe_first(tags.get("performer"))
                    )
                    raw_title = _safe_first(tags.get("title"))

                if not raw_title:
                    raw_title = file_path.stem

                raw_artist_key = _normalize(raw_artist)
                raw_title_key = _normalize(raw_title)
                artist_key = _canonical_artist(raw_artist)
                title_key = _canonical_title(raw_title)

                if not artist_key and raw_artist_key:
                    artist_key = raw_artist_key
                if not title_key and raw_title_key:
                    title_key = raw_title_key

                if not artist_key or not title_key:
                    continue

                indexed = IndexedTrack(
                    raw_artist_key=raw_artist_key,
                    raw_title_key=raw_title_key,
                    artist_key=artist_key,
                    title_key=title_key,
                    filename_key=_normalize(file_path.stem),
                    path=str(file_path),
                )
                tracks.append(indexed)
                by_artist.setdefault(artist_key, []).append(indexed)
                exact_map.setdefault((artist_key, title_key), indexed.path)
                if raw_artist_key and raw_title_key:
                    raw_exact_map.setdefault((raw_artist_key, raw_title_key), indexed.path)

        with self._lock:
            self._tracks = tracks
            self._by_artist = by_artist
            self._exact_map = exact_map
            self._raw_exact_map = raw_exact_map
            self._library_path = library_path
            self._is_ready = True

    def refresh_if_path_changed(self, library_path: str) -> None:
        if library_path != self._library_path or not self._is_ready:
            self.build(library_path)

    def find_track(self, artist: str, title: str) -> str | None:
        raw_artist_key = _normalize(artist)
        raw_title_key = _normalize(title)
        artist_key = _canonical_artist(artist)
        title_key = _canonical_title(title)
        if not artist_key:
            artist_key = raw_artist_key
        if not title_key:
            title_key = raw_title_key

        if not artist_key or not title_key:
            return None

        with self._lock:
            raw_exact = self._raw_exact_map.get((raw_artist_key, raw_title_key))
            if raw_exact:
                return raw_exact

            exact = self._exact_map.get((artist_key, title_key))
            if exact:
                return exact

            artist_candidates = list(self._by_artist.get(artist_key, []))
            all_tracks = list(self._tracks)

        title_variants = {title_key, raw_title_key}
        artist_variants = {artist_key, raw_artist_key}

        best_path: str | None = None
        best_score = 0.0

        for candidate in artist_candidates:
            score = max(
                SequenceMatcher(a=variant, b=candidate.title_key).ratio()
                for variant in title_variants
                if variant
            )
            if score > best_score:
                best_score = score
                best_path = candidate.path

        if best_score >= 0.87:
            return best_path

        # Handle tracks where title tags differ but filename still clearly matches.
        title_tokens = {token for token in title_key.split() if len(token) > 2}
        artist_tokens = {token for token in artist_key.split() if len(token) > 2}
        if title_tokens and artist_tokens:
            for candidate in artist_candidates:
                filename_tokens = set(candidate.filename_key.split())
                title_overlap = len(title_tokens.intersection(filename_tokens)) / len(title_tokens)
                artist_overlap = len(artist_tokens.intersection(filename_tokens)) / len(artist_tokens)
                if title_overlap >= 0.7 and artist_overlap >= 0.5:
                    return candidate.path

        # Fallback for artist name differences: require strong combined similarity.
        global_best_path: str | None = None
        global_best_score = 0.0
        for candidate in all_tracks:
            artist_score = max(
                SequenceMatcher(a=variant, b=candidate.artist_key).ratio()
                for variant in artist_variants
                if variant
            )
            title_score = max(
                SequenceMatcher(a=variant, b=candidate.title_key).ratio()
                for variant in title_variants
                if variant
            )
            combined = (artist_score * 0.45) + (title_score * 0.55)
            if combined > global_best_score:
                global_best_score = combined
                global_best_path = candidate.path

        if global_best_score >= 0.92:
            return global_best_path

        return None
