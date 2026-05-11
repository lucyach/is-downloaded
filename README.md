# is-downloaded

Basic full-stack outline for checking whether your most played Last.fm tracks are downloaded in your local MP3 library.

## Stack

- Frontend: React + TypeScript (Vite)
- API: Python + FastAPI
- MP3 metadata: `mutagen`
- External data: Last.fm API (`user.getTopTracks`)

## Project layout

- `backend/`: FastAPI app
- `frontend/`: React app

## What this outline already includes

- API endpoint to fetch top tracks from Last.fm
- API endpoint to check one track against local MP3 metadata
- API endpoint to return top tracks with downloaded status
- Basic React UI to input a Last.fm username and display results
- Startup MP3 index cache to avoid rescanning for each query
- Fuzzy matching for artist/title variations (feat/remix/punctuation)
- Docker Compose setup and one-command root dev scripts

## Next steps after scaffold

1. Add your Last.fm API key to `backend/.env`.
2. Set your local MP3 library path in `backend/.env`.
3. Create a Python virtual environment and install backend dependencies.
4. Install frontend dependencies and run Vite.
5. Improve matching logic (fuzzy matching, cache index, and tests).

## Local development

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Or from root with npm script support:

```powershell
cd ..
npm install
npm run dev
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:8000`.

## Docker development

1. Copy `.env.example` at the repository root to `.env`.
2. Set `LASTFM_API_KEY` and optionally `MUSIC_LIBRARY_HOST_PATH`.
3. Start all services:

```powershell
npm run dev:docker
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

## Notes on matching

- The backend builds an index from your mp3 metadata on startup.
- Exact normalized match is attempted first.
- Fuzzy matching then compares title/artist similarity for common metadata differences.
