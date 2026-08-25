# SmartNote LMS — Project Instructions for Cursor AI Agent
> **Version:** 2.0 | **Language:** Python + React | **Mode:** Fully Local

---

## 1. Project Goal

Build a local web application that converts raw lecture materials (MP4, MP3, PDF) into complete, beautifully formatted Hebrew study notebooks — with zero omissions from the source material.

---

## 2. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React (Vite) + TailwindCSS | Fast dev server, great ecosystem |
| Markdown Rendering | `react-markdown` + `remark-math` + `rehype-katex` | LaTeX + RTL support |
| Backend | Python 3.11 + FastAPI | Async, easy file handling |
| Audio Extraction | `ffmpeg-python` (calls local FFmpeg binary) | Industry standard |
| Transcription | OpenAI Whisper API (`whisper-1`) | Best Hebrew accuracy |
| PDF Processing | `PyMuPDF` (`fitz`) | Extracts text AND images reliably |
| AI Editor | Google Gemini 1.5 Pro API | 1M token context — handles long lectures |
| Job Queue | Python `asyncio` + SQLite (via `aiosqlite`) | Tracks job status locally, no extra infra |
| Storage | Local filesystem (`/Courses/` directory) | No DB needed for files |

> ⚠️ **Decision locked:** Use **Gemini 1.5 Pro** only. Do not add Claude or other LLMs unless I explicitly ask.

---

## 3. Local File System Structure

```
/Courses/
  {Course_Name}/
    {##_Lecture_Topic}/          ← e.g., "03_Nervous_System"
      raw_media/
        lecture.mp4              ← or .mp3
        presentation.pdf
        extra_material_1.pdf
      extracted_images/
        slide_001.png
        slide_002.png
        ...
      transcripts/
        raw_transcript.txt       ← raw Whisper output
      final_notebook.md          ← THE OUTPUT
      job_status.json            ← tracks pipeline progress
```

**`job_status.json` structure:**
```json
{
  "job_id": "uuid-here",
  "status": "processing",
  "stage": "transcribing",
  "progress_pct": 40,
  "error": null,
  "created_at": "2025-01-01T12:00:00",
  "completed_at": null
}
```

---

## 4. Backend: API Endpoints

```
POST   /api/courses                    → Create new course
GET    /api/courses                    → List all courses
POST   /api/courses/{name}/lectures    → Create lecture, trigger pipeline
GET    /api/courses/{name}/lectures    → List lectures in course
GET    /api/lectures/{id}/status       → Poll job status (SSE or polling)
GET    /api/lectures/{id}/notebook     → Get final_notebook.md content
PUT    /api/lectures/{id}/notebook     → Save edited notebook content
GET    /api/lectures/{id}/images       → List extracted images
POST   /api/lectures/{id}/export       → Export as PDF or DOCX
```

---

## 5. File Upload Strategy — IMPORTANT

> ⚠️ **Do NOT use standard multipart upload for video files.** Files can be 1-4 GB.

**Use one of these two approaches (implement both as options):**

**Option A — Local Path Input (Primary):**
The user types/pastes the full local path to the file (e.g., `C:\Lectures\bio_week3.mp4`). The backend reads it directly from disk. No upload needed.

**Option B — Chunked Upload (Secondary, for smaller files <200MB):**
Use chunked streaming upload with `Content-Range` headers. The frontend sends 10MB chunks. The backend reassembles them.

---

## 6. Processing Pipeline (Backend)

### Stage 1: Audio Extraction
```python
# If input is MP4 → extract MP3
ffmpeg.input(mp4_path).output(mp3_path, acodec='mp3', audio_bitrate='128k').run()
# If input is already MP3 → skip this stage
```

### Stage 2: Transcription (Whisper API)
```python
# Split audio into 20-minute chunks if > 25MB (Whisper API limit)
# Send each chunk, concatenate results
# Save to: transcripts/raw_transcript.txt
client.audio.transcriptions.create(
    model="whisper-1",
    file=audio_file,
    language="he",          # Hebrew
    response_format="text"
)
```

### Stage 3: PDF Processing (PyMuPDF)
```python
import fitz  # PyMuPDF
doc = fitz.open(pdf_path)
for page_num, page in enumerate(doc):
    # Extract text
    text += page.get_text()
    # Extract images
    for img_index, img in enumerate(page.get_images()):
        xref = img[0]
        pix = fitz.Pixmap(doc, xref)
        pix.save(f"extracted_images/slide_{page_num:03d}_{img_index}.png")
```

### Stage 4: AI Editing (Gemini 1.5 Pro)
See Section 7 for the full prompt specification.

### Stage 5: Notebook Assembly
- Replace image placeholders with actual relative paths
- Save as `final_notebook.md`
- Update `job_status.json` → `"status": "completed"`

### Error Handling
- Each stage must update `job_status.json` with `"error": "description"` on failure
- The pipeline must be resumable: check which stages are already complete before re-running
- Log all errors to `pipeline.log` inside the lecture folder

---

## 7. AI Prompt Specification (Gemini)

### System Prompt
```
You are an expert academic editor and note-taker. You receive:
1. A raw Hebrew lecture transcript (from Whisper, may contain errors)
2. Extracted text from the lecture's PDF presentation slides

Your job is to produce a complete, structured Hebrew study notebook in Markdown format.
Respond ONLY with the Markdown content. No preamble, no explanation.
```

### User Prompt Template
```
## Raw Transcript:
{raw_transcript}

## PDF Slide Text (Source of Truth for terminology):
{pdf_text}

## Strict Rules:
1. NO OMISSIONS: Include every topic, explanation, and example from the transcript.
   Remove only: filler words ("אמ", "כאילו"), repetitions, and off-topic small talk.
2. TERMINOLOGY FIX: Use the PDF text to correct any misspelled technical terms,
   formulas, or English concepts in the transcript.
3. HIGHLIGHT: Bold (**term**) every key definition and important concept on first mention.
4. STRUCTURE: Organize into clear sections matching the lecture flow.
   Use: # for main topics, ## for subtopics, ### for examples/cases.
5. IMAGE PLACEHOLDERS: Where the speaker references a slide or diagram, insert:
   `![תיאור קצר](./extracted_images/PLACEHOLDER.png)`
   I will match these to actual images later.
6. PDF DIFF SECTION: At the END of the notebook, add a section:
   ## 📋 נושאים מהמצגת שלא נדונו בהרצאה
   List any topics/slides present in the PDF but not covered in the transcript.
   If all topics were covered, write: "כל נושאי המצגת כוסו בהרצאה."
7. RTL: Write in Hebrew (RTL). English terms stay in English inline.
8. MATH: Use LaTeX for any formulas: $formula$ for inline, $$formula$$ for block.

## Output Format:
# {lecture_topic}
**קורס:** {course_name} | **הרצאה:** {lecture_number}
**תאריך עיבוד:** {date}

---
[notebook content here]
```

---

## 8. Frontend: UI Specification

### Screen 1: Course Dashboard
- Grid of course cards, each showing course name + lecture count
- "+ קורס חדש" button → modal with course name input
- Click course → goes to lecture list

### Screen 2: Lecture List (inside a course)
- List of lectures sorted by number
- Each item shows: number, topic, status badge (processing / done / error)
- "+ הרצאה חדשה" button → goes to Creation Interface

### Screen 3: Creation Interface
```
┌─────────────────────────────────────────┐
│  הרצאה חדשה בקורס: [Course Name]        │
├─────────────────────────────────────────┤
│  מספר הרצאה: [  ]   נושא: [          ] │
├─────────────────────────────────────────┤
│  🎬 מדיה (MP4/MP3)                      │
│  [ הזן נתיב מקומי... ]  או  [גרור קובץ] │
├─────────────────────────────────────────┤
│  📄 מצגת (PDF)                          │
│  [ הזן נתיב מקומי... ]  או  [גרור קובץ] │
├─────────────────────────────────────────┤
│  📎 חומרים נוספים (PDF/Docx) — אופציונלי│
│  [ + הוסף קובץ ]                        │
├─────────────────────────────────────────┤
│              [ 🚀 התחל עיבוד ]           │
└─────────────────────────────────────────┘
```

### Screen 4: Processing Progress
```
┌─────────────────────────────────────────┐
│  ⏳ מעבד: עצבים - הרצאה 3               │
│                                         │
│  ✅ חילוץ אודיו           [מושלם]       │
│  ✅ תמלול (Whisper)        [מושלם]       │
│  🔄 עיבוד PDF             [40%]  ████░  │
│  ⏸  עריכת AI              [ממתין]       │
│  ⏸  הרכבת מחברת           [ממתין]       │
│                                         │
│  [ביטול]                                │
└─────────────────────────────────────────┘
```
- Poll `/api/lectures/{id}/status` every 2 seconds
- On completion → auto-navigate to Notebook Editor

### Screen 5: Notebook Editor
- **Split-pane view:** Left = Markdown source, Right = rendered preview
- OR: **WYSIWYG mode** using a rich Markdown editor
- Hebrew text must be RTL. English inline terms stay LTR (use CSS `unicode-bidi`)
- Images from `extracted_images/` render inline
- LaTeX renders via KaTeX
- Top bar: [שמור] [ייצוא MD] [ייצוא PDF] [ייצוא DOCX]

---

## 9. Export Functionality

| Format | Library | Notes |
|---|---|---|
| `.md` | Native (just save the file) | Trivial |
| `.pdf` | `weasyprint` or `playwright` (headless Chromium) | Render the HTML version of the MD |
| `.docx` | `python-docx` + `pypandoc` | Convert MD → DOCX |

---

## 10. Environment Variables (`.env` file — never commit)

```
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
COURSES_BASE_PATH=C:/path/to/SmartNote_Project/Courses
FFMPEG_PATH=C:/ffmpeg/bin/ffmpeg.exe
```

---

## 11. Build Order for Cursor Agent

Execute these phases **in order**. Wait for my approval between phases.

### Phase 1 — Skeleton (Start Here)
- [ ] Create `/frontend` with Vite + React + TailwindCSS
- [ ] Create `/backend` with FastAPI structure (`main.py`, `routers/`, `services/`, `models/`)
- [ ] Create `requirements.txt` and `package.json`
- [ ] Create `/Courses` folder with a `.gitkeep`
- [ ] Create `.env.example` with all required keys
- [ ] Create `README.md` with setup instructions (including FFmpeg install)

### Phase 2 — Course & Lecture Management
- [ ] Backend: Course CRUD endpoints
- [ ] Backend: Lecture creation + folder structure generation
- [ ] Frontend: Dashboard + Course view + Creation form (no upload logic yet)

### Phase 3 — File Handling
- [ ] Backend: Local path validation endpoint
- [ ] Backend: Chunked upload endpoint (for smaller files)
- [ ] Frontend: File input with local path + drag-and-drop

### Phase 4 — Processing Pipeline
- [ ] Backend: FFmpeg audio extraction service
- [ ] Backend: Audio chunking + Whisper transcription service
- [ ] Backend: PyMuPDF text + image extraction service
- [ ] Backend: Job queue with `job_status.json` tracking
- [ ] Frontend: Progress polling UI

### Phase 5 — AI Integration ⚠️ (Requires my API keys)
- [ ] Backend: Gemini API service with the prompt from Section 7
- [ ] Backend: Full pipeline orchestration
- [ ] Test with a real lecture

### Phase 6 — Notebook Editor & Export
- [ ] Frontend: Markdown editor with RTL + LaTeX + image rendering
- [ ] Backend: Export endpoints (PDF, DOCX)
- [ ] Frontend: Export buttons

---

## 12. Non-Negotiable Constraints

1. **Hebrew-first:** All UI text in Hebrew. RTL layout. English technical terms stay inline in English.
2. **No cloud storage:** Everything stays on the user's machine. No S3, no Firebase.
3. **No summaries:** The AI must not compress or omit content. Full fidelity to the lecture.
4. **Resumable jobs:** If a pipeline stage fails, it should be restartable without re-doing completed stages.
5. **API keys only from `.env`:** Never hardcode keys. Never log them.