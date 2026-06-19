# SmartNote LMS

Local web application that converts lecture materials (MP4, MP3, PDF) into formatted Hebrew study notebooks.

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** and npm
- **FFmpeg** — required for audio extraction from video files

### Installing FFmpeg (Windows)

1. Download a build from [https://www.gyan.dev/ffmpeg/builds/](https://www.gyan.dev/ffmpeg/builds/) (recommended: `ffmpeg-release-essentials.zip`).
2. Extract the archive to a permanent location, e.g. `C:\ffmpeg`.
3. Add `C:\ffmpeg\bin` to your system **PATH**, or set `FFMPEG_PATH` in `.env` (see below).
4. Verify in a new terminal:

   ```powershell
   ffmpeg -version
   ```

## Project structure

```
SmartNote_Project/
├── backend/          # FastAPI application
├── frontend/         # React + Vite + TailwindCSS
├── Courses/          # Local storage for course/lecture data
├── requirements.txt  # Python dependencies (project root)
└── .env              # API keys and paths (not committed)
```

## Setup (first time only)

### 1. Environment variables

```powershell
copy .env.example .env
```

Required variables:

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key (Whisper transcription) |
| `GEMINI_API_KEY` | Google Gemini API key (AI editing) |
| `COURSES_BASE_PATH` | Absolute path to the `Courses/` folder |
| `FFMPEG_PATH` | Full path to `ffmpeg.exe` (if not on PATH) |

### 2. Install dependencies

From the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

```powershell
cd frontend
npm install
cd ..
```

## Running the app

**Terminal 1 — Backend** (from project root):

```powershell
cd C:\Users\user\Projects\SmartNote_Project
.\.venv\Scripts\Activate.ps1
uvicorn backend.main:app --reload --port 8000
```

Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

**Terminal 2 — Frontend**:

```powershell
cd C:\Users\user\Projects\SmartNote_Project\frontend
npm run dev
```

App: [http://localhost:5173](http://localhost:5173)

The Vite dev server proxies `/api` requests to the backend on port 8000.

## Development status

- Phase 1 (skeleton) — complete
- Phase 2 (course & lecture management) — complete
- Phase 3 (local file path handling) — complete
- Phase 4 (processing pipeline through PDF extraction) — complete
- Phase 5 (Gemini AI editing & notebook editor) — pending
