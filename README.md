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

## Local development

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 5173
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
