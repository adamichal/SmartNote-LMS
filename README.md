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
├── requirements.txt  # Python dependencies
└── .env              # API keys and paths (not committed)
```

## Setup

### 1. Environment variables

Copy the example file and fill in your values:

```powershell
copy .env.example .env
```

Required variables:

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key (Whisper transcription) |
| `GEMINI_API_KEY` | Google Gemini API key (AI editing) |
| `COURSES_BASE_PATH` | AbsolutePath to the `Courses/` folder |
| `FFMPEG_PATH` | Full path to `ffmpeg.exe` (if not on PATH) |

### 2. Backend

From the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

### 3. Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

App: [http://localhost:5173](http://localhost:5173)

The Vite dev server proxies `/api` requests to the backend on port 8000.

## Development status

Phase 1 (skeleton) is complete. Course management, file handling, processing pipeline, and AI integration will be added in later phases.
