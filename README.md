# SmartNote LMS

A local-first web app that turns raw lecture material — recordings, slide decks, transcripts — into structured, exportable Hebrew study notebooks. Built to automate a genuinely tedious manual task: sitting through a lecture recording and hand-writing notes that match the slides.

## What it does

Feed it a lecture (an MP4/MP3 recording or a plain transcript, plus the presentation PDF) and SmartNote runs a full pipeline:

1. **Audio extraction** — FFmpeg pulls audio from video and chunks it for transcription.
2. **Transcription** — a locally-run, Hebrew-tuned Whisper model (`ivrit-ai/whisper-large-v3-turbo-ct2` via `faster-whisper`) transcribes speech to text, entirely offline.
3. **Slide extraction** — PyMuPDF rasterizes each PDF page so the model can reference specific slides.
4. **AI synthesis** — Google Gemini merges the transcript and slide catalog into a complete Markdown notebook, inserting slide images only where they match the discussed content and preserving RTL formatting and math notation.
5. **Editing** — a WYSIWYG editor (Markdown ⇄ HTML via Turndown/remark, KaTeX for math, Mermaid for diagrams) lets you refine the generated notebook.
6. **Export** — download as DOCX (built client-side with JSZip, no server round-trip) or print-to-PDF, both preserving RTL layout, math, and diagrams.

Lectures process in parallel (up to 3 concurrent jobs) in a background thread pool, each with its own progress page and resumable pipeline stages — if a step fails, you can fix the input and retry from that stage instead of starting over.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLite (aiosqlite) |
| Frontend | React 19, Vite, TailwindCSS |
| Transcription | faster-whisper (local, Hebrew-tuned model) |
| AI synthesis | Google Gemini (`google-genai`) |
| PDF processing | PyMuPDF |
| Media processing | FFmpeg |
| Editor | MDXEditor, Turndown, remark/rehype, KaTeX, Mermaid |
| Export | Custom DOCX builder (JSZip), Pandoc (optional), browser print-to-PDF |

## Screenshots

*(add a screenshot or short screen recording of the notebook editor here)*

## Getting started

### Prerequisites

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

### 1. Environment variables

```powershell
copy .env.example .env
```

| Variable | Description | Required |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key (AI note synthesis) | Yes |
| `COURSES_BASE_PATH` | Absolute path to the `Courses/` folder | Yes |
| `FFMPEG_PATH` | Full path to `ffmpeg.exe` (if not on PATH) | If FFmpeg isn't on PATH |
| `GEMINI_MODEL` | Override the Gemini model (auto-picked by default) | No |
| `WHISPER_MODEL` | Override the Whisper model (defaults to a Hebrew-tuned model) | No |
| `WHISPER_DEVICE` | `cpu` or `cuda` | No |

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
.\.venv\Scripts\Activate.ps1
uvicorn backend.main:app --reload --port 8000 --reload-dir backend
```

Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

**Terminal 2 — Frontend**:

```powershell
cd frontend
npm run dev
```

App: [http://localhost:5173](http://localhost:5173)

The Vite dev server proxies `/api` requests to the backend on port 8000. Use `--reload-dir backend` so file changes inside `Courses/` (pipeline output) don't restart the server mid-processing.

### Creating lectures

Each lecture requires a **presentation PDF**. You must also provide **either**:

- an **MP4/MP3** recording (transcribed locally via Whisper), or
- a **transcript `.txt` file** (skips transcription entirely)

You can add **extra PDF sources** (articles, handouts) to enrich the AI summary.

### FFmpeg troubleshooting

On startup, the backend logs whether FFmpeg was found; check [http://localhost:8000/api/health](http://localhost:8000/api/health) as well. If `"ffmpeg": { "available": false }`:

1. Set `FFMPEG_PATH` in `.env` to the **full path** to `ffmpeg.exe`, e.g. `C:/ffmpeg/bin/ffmpeg.exe`
2. Or install FFmpeg and add its `bin` folder to your system **PATH**

After fixing, restart the backend. On the next pipeline run, `pipeline.log` inside the lecture folder will contain the exact FFmpeg command used.

### Export prerequisites

- **PDF** — opens a print preview in the browser (Hebrew + math render correctly). Choose **Save as PDF** / **Microsoft Print to PDF** in the print dialog.
- **DOCX** — requires [Pandoc](https://pandoc.org/installing.html) installed and available on PATH.

## Project structure

```text
SmartNote_Project/
├── backend/          # FastAPI application, pipeline services
├── frontend/         # React + Vite + TailwindCSS
├── docs/             # Design notes and specs
├── scripts/          # One-off maintenance/export scripts
├── Courses/          # Local storage for course/lecture data (not committed)
└── requirements.txt  # Python dependencies
```

## Development status

- Phase 1 (skeleton) — complete
- Phase 2 (course & lecture management) — complete
- Phase 3 (local file path handling) — complete
- Phase 4 (processing pipeline through PDF extraction) — complete
- Phase 5 (Gemini AI editing & notebook assembly) — complete
- Phase 6 (notebook editor & export) — complete

## License

MIT — see [LICENSE](LICENSE).
