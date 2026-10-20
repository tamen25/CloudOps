"""Kinesis poll loop. Reads the order-event stream (the storefront-events
stream reused as the mesh event backbone) and folds it into the read model.
The shard handling and its recovery paths are in consumer.py; this module is
the process wiring. Boto3 is imported lazily so the unit tests need no AWS
deps."""

from __future__ import annotations

import os
import time

from projection.consumer import ShardConsumer
from projection.readmodel import ReadModel
from projection.server import serve

# Waiting longer after a throttled pass lets the shard's read budget refill.
THROTTLE_BACKOFF_SECONDS = 5.0


def run() -> None:
    port = int(os.environ.get("PORT", "8080"))
    stream = os.environ.get("KINESIS_STREAM_NAME", "")
    region = os.environ.get("AWS_REGION", "us-east-1")
    poll_interval = float(os.environ.get("POLL_INTERVAL_SECONDS", "2"))

    model = ReadModel()
    serve(model, port)

    if not stream:
        # No stream configured (dev without events): stay alive serving health
        # so the pod is Ready, but do no polling.
        print("KINESIS_STREAM_NAME unset — projection worker idle (health only)")
        while True:
            time.sleep(3600)

    import boto3  # lazy: only needed when a stream is configured

    consumer = ShardConsumer(boto3.client("kinesis", region_name=region), stream, model)
    consumer.start()
    print(f"projection worker consuming {stream} ({len(consumer.iterators)} shards)")

    while True:
        throttled = consumer.poll_once()
        time.sleep(THROTTLE_BACKOFF_SECONDS if throttled else poll_interval)


if __name__ == "__main__":
    run()
