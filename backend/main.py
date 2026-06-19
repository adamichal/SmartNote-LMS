import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import GEMINI_API_KEY, GEMINI_MODEL
from backend.routers import courses, files, lectures, uploads
from backend.services.ffmpeg_utils import verify_ffmpeg_on_startup

logging.basicConfig(level=logging.INFO)


def _gemini_status() -> dict:
    if GEMINI_API_KEY:
        return {
            "available": True,
            "model": GEMINI_MODEL,
            "message": "GEMINI_API_KEY configured",
        }
    return {
        "available": False,
        "model": GEMINI_MODEL,
        "message": "GEMINI_API_KEY is not configured",
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ffmpeg = verify_ffmpeg_on_startup()
    app.state.gemini = _gemini_status()
    if not app.state.gemini["available"]:
        logging.error(
            "GEMINI_API_KEY not set — AI editing will fail. Add it to .env."
        )
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
    gemini = getattr(app.state, "gemini", None) or _gemini_status()
    ok = ffmpeg.get("available") and gemini.get("available")
    return {
        "status": "ok" if ok else "degraded",
        "ffmpeg": ffmpeg,
        "gemini": gemini,
    }
