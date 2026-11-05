"""Entry point: `python -m inventory` serves the app with uvicorn, logging JSON
through inventory.logs (uvicorn's own access log off: the app's access
middleware logs each request with its span)."""

import os

import uvicorn

from inventory.logs import LOG_CONFIG

if __name__ == "__main__":
    uvicorn.run(
        "inventory.app:app",
        host="0.0.0.0",  # nosec B104: the container's only interface is the pod network
        port=int(os.environ.get("PORT", "8080")),
        log_config=LOG_CONFIG,
        access_log=False,
    )
