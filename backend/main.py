import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers import habits, records, tasks, goals, reminders, mood, achievements, routine

app = FastAPI(title="Habit Tracker API")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

app.include_router(habits.router)
app.include_router(records.router)
app.include_router(tasks.router)
app.include_router(goals.router)
app.include_router(reminders.router)
app.include_router(mood.router)
app.include_router(achievements.router)
app.include_router(routine.router)


@app.get("/")
def root():
    return {"status": "ok"}
