import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import COURSES_BASE_PATH
from backend.routers import courses, files, lectures, uploads
from backend.services.ffmpeg_utils import verify_ffmpeg_on_startup
from backend.services.export import check_pdf_export_available
from backend.services.gemini_utils import verify_gemini_on_startup
from backend.services.job_status import recover_interrupted_jobs

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ffmpeg = verify_ffmpeg_on_startup()
    app.state.gemini = verify_gemini_on_startup()
    if not app.state.gemini["available"]:
        logging.error("Gemini check failed: %s", app.state.gemini["message"])
    # jobs live in memory, so anything still "processing" was cut off by the last shutdown
    for line in recover_interrupted_jobs(COURSES_BASE_PATH):
        logging.warning("Recovered lecture status: %s", line)
    yield


app = FastAPI(title="SmartNote LMS", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(courses.router)
app.include_router(files.router)
app.include_router(uploads.router)
app.include_router(lectures.router)


@app.get("/api/health")
async def health_check():
    ffmpeg = getattr(app.state, "ffmpeg", None) or verify_ffmpeg_on_startup()
    gemini = getattr(app.state, "gemini", None) or verify_gemini_on_startup()
    pdf_export = check_pdf_export_available()
    ok = ffmpeg.get("available") and gemini.get("available")
    return {
        "status": "ok" if ok else "degraded",
        "ffmpeg": ffmpeg,
        "gemini": gemini,
        "pdf_export": pdf_export,
    }
