import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import courses, files, lectures, uploads
from backend.services.ffmpeg_utils import verify_ffmpeg_on_startup

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ffmpeg = verify_ffmpeg_on_startup()
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
    return {
        "status": "ok" if ffmpeg.get("available") else "degraded",
        "ffmpeg": ffmpeg,
    }
