"""Kinesis poll loop. Reads the order-event stream (the storefront-events
stream reused as the mesh event backbone), decodes records, and folds them into
the read model. Boto3 is imported lazily so the unit tests (readmodel) need no
AWS deps. The loop is intentionally sequential and simple for the dev tier."""

from __future__ import annotations

import os
import time

from projection.readmodel import ReadModel, decode_record
from projection.server import serve


def _shard_iterators(client, stream: str) -> dict[str, str]:
    shards = client.list_shards(StreamName=stream)["Shards"]
    iters: dict[str, str] = {}
    for shard in shards:
        sid = shard["ShardId"]
        resp = client.get_shard_iterator(
            StreamName=stream, ShardId=sid, ShardIteratorType="LATEST"
        )
        iters[sid] = resp["ShardIterator"]
    return iters


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

    client = boto3.client("kinesis", region_name=region)
    iterators = _shard_iterators(client, stream)
    print(f"projection worker consuming {stream} ({len(iterators)} shards)")

    while True:
        for sid, shard_iter in list(iterators.items()):
            if not shard_iter:
                continue
            resp = client.get_records(ShardIterator=shard_iter, Limit=100)
            for record in resp.get("Records", []):
                event = decode_record(record)
                if event is None:
                    model.skipped += 1
                    continue
                model.apply(event)
            iterators[sid] = resp.get("NextShardIterator", "")
        time.sleep(poll_interval)


if __name__ == "__main__":
    run()
