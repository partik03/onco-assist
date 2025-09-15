from fastapi import FastAPI
from pydantic_settings import BaseSettings
import os
from dotenv import load_dotenv
from .db import tidb
from .routes import router as api_router


load_dotenv()


class Settings(BaseSettings):
    TIDB_HOST: str = os.getenv("TIDB_HOST", "localhost")
    TIDB_PORT: int = int(os.getenv("TIDB_PORT", "4000"))
    TIDB_USER: str = os.getenv("TIDB_USER", "root")
    TIDB_PASSWORD: str = os.getenv("TIDB_PASSWORD", "")
    TIDB_DATABASE: str = os.getenv("TIDB_DATABASE", "onco_assist")


settings = Settings()

app = FastAPI(title="OncoAssist Python API", version="0.1.0")
app.include_router(api_router)


@app.on_event("startup")
def on_startup() -> None:
    try:
        tidb.connect()
    except Exception:
        # Defer error to health endpoint
        pass


@app.on_event("shutdown")
def on_shutdown() -> None:
    tidb.close()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "services": {
            "tidb": {
                "host": settings.TIDB_HOST,
                "port": settings.TIDB_PORT,
                "database": settings.TIDB_DATABASE,
                "alive": tidb.ping(),
            }
        },
    }


@app.get("/db/health")
async def db_health():
    alive = tidb.ping()
    return {"ok": alive}


