import time
from collections import deque

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.core.config import get_settings
from app.db import SessionLocal
from app.routers import auth, courses, grades, reports, submissions, teams

settings = get_settings()
app = FastAPI(
    title="Monaqesh Backend",
    version="0.1.0",
    description="Phase 1: existing accounts, courses, grades, teams and submissions.",
)
app.state.rate_limits = {}


class RequestSizeLimit:
    """Limit the entire request, including streamed/chunked multipart bodies."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        total = 0
        limit = (settings.max_upload_mb + 1) * 1024 * 1024

        async def limited_receive():
            nonlocal total
            message = await receive()
            total += len(message.get("body", b""))
            if total > limit:
                raise HTTPException(413, "Request body exceeds maximum size")
            return message

        await self.app(scope, limited_receive, send)


app.add_middleware(RequestSizeLimit)


@app.middleware("http")
async def request_controls(request: Request, call_next):
    # This starter runs with one worker. Use a shared rate limiter at the proxy
    # when deploying multiple workers. Never trust arbitrary X-Forwarded-For.
    path = request.url.path
    limited = path in {
        "/api/auth/login",
        "/api/auth/token",
        "/api/auth/change-password",
    } or path.endswith("/teams/join")
    if limited and request.method == "POST":
        now = time.monotonic()
        limits = app.state.rate_limits
        if len(limits) > 10000:
            app.state.rate_limits = limits = {
                k: v for k, v in limits.items() if v and now - v[-1] < 60
            }
        key = (request.client.host if request.client else "unknown", path)
        attempts = limits.setdefault(key, deque())
        while attempts and now - attempts[0] >= 60:
            attempts.popleft()
        if len(attempts) >= 10:
            return JSONResponse(
                {"detail": "Too many attempts; try again in a minute"},
                429,
                headers={"Retry-After": "60", "Cache-Control": "no-store"},
            )
        attempts.append(now)
    length = request.headers.get("content-length")
    if length and (
        not length.isdigit() or int(length) > (settings.max_upload_mb + 1) * 1024 * 1024
    ):
        return JSONResponse({"detail": "Request body exceeds maximum size"}, 413)
    response = await call_next(request)
    if path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(IntegrityError)
async def conflict(_request, _exception):
    return JSONResponse(
        {"detail": "This operation conflicts with an existing record"}, status_code=409
    )


@app.exception_handler(SQLAlchemyError)
async def database_error(_request, _exception):
    return JSONResponse(
        {"detail": "Database operation failed; contact the project administrator"}, status_code=503
    )


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "phase": 1}


@app.get("/health/database", tags=["Health"])
def database_health():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok"}


for router in (
    auth.router,
    courses.router,
    teams.router,
    grades.router,
    submissions.router,
    reports.router,
):
    app.include_router(router, prefix="/api")

# Outermost middleware: browser clients also receive CORS headers on 413/429.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
