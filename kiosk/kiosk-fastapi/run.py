import os
import dotenv
import uvicorn
import logging.config

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "()": "uvicorn.logging.DefaultFormatter",
            "fmt": "%(levelprefix)s %(message)s",
            "use_colors": False,   # 🔴 CRITICAL
        }
    },
    "handlers": {
        "default": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "stream": "ext://sys.stderr",
        }
    },
    "loggers": {
        "uvicorn": {"handlers": ["default"], "level": "WARNING"},
        "uvicorn.error": {"level": "WARNING"},
        "uvicorn.access": {"handlers": ["default"], "level": "WARNING"},
    },
}

if __name__ == "__main__":
    dotenv.load_dotenv()
    port = int(os.getenv("FASTAPI_PORT", "8000"))

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=port,
        log_config=LOGGING_CONFIG,  # 🔴 THIS FIXES IT
    )
