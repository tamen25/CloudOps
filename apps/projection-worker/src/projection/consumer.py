"""Kinesis shard consumer for the read model. The client is injected (a boto3
Kinesis client in production, a fake in tests), so the recovery paths are
tested without AWS.

What it survives, that the first loop did not:
- throttling: the shard is retried on the next pass instead of the error
  ending the process;
- an expired iterator (one left unused for 5 minutes): a new one starts
  after the last record read, so nothing is skipped or read twice;
- a closed shard after resharding: its child shards are picked up from
  their start;
- any other error on one shard: logged, and the other shards carry on.
"""

from __future__ import annotations

import logging

from projection.readmodel import ReadModel, decode_record

log = logging.getLogger("projection")

RETRYABLE = {"ProvisionedThroughputExceededException", "LimitExceededException"}


def _error_code(exc: Exception) -> str:
    return getattr(exc, "response", {}).get("Error", {}).get("Code", type(exc).__name__)


class ShardConsumer:
    def __init__(self, client, stream: str, model: ReadModel):
        self.client = client
        self.stream = stream
        self.model = model
        self.iterators: dict[str, str] = {}
        self.last_seq: dict[str, str] = {}
        self.closed: set[str] = set()

    def start(self) -> None:
        """Begin at the tip of every open shard."""
        for shard in self._shards():
            self.iterators[shard["ShardId"]] = self._iterator(shard["ShardId"], "LATEST")

    def poll_once(self) -> bool:
        """Read each shard once. Returns True when any shard was throttled,
        so the caller can wait longer before the next pass."""
        throttled = False
        for sid in list(self.iterators):
            try:
                resp = self.client.get_records(ShardIterator=self.iterators[sid], Limit=100)
            except Exception as exc:  # noqa: BLE001 — every failure is handled below
                code = _error_code(exc)
                if code in RETRYABLE:
                    throttled = True
                elif code == "ExpiredIteratorException":
                    self.iterators[sid] = self._resume(sid)
                else:
                    log.warning("get_records failed on %s: %s", sid, exc)
                continue
            for record in resp.get("Records", []):
                self.last_seq[sid] = record["SequenceNumber"]
                event = decode_record(record)
                if event is None:
                    self.model.skipped += 1
                    continue
                self.model.apply(event)
            nxt = resp.get("NextShardIterator")
            if nxt:
                self.iterators[sid] = nxt
            else:
                # The shard was closed by a reshard; its records are all read.
                del self.iterators[sid]
                self.closed.add(sid)
                self._adopt_children(sid)
        return throttled

    def _resume(self, sid: str) -> str:
        if sid in self.last_seq:
            return self._iterator(sid, "AFTER_SEQUENCE_NUMBER", self.last_seq[sid])
        return self._iterator(sid, "LATEST")

    def _adopt_children(self, parent: str) -> None:
        for shard in self._shards():
            sid = shard["ShardId"]
            if shard.get("ParentShardId") == parent and sid not in self.iterators and sid not in self.closed:
                self.iterators[sid] = self._iterator(sid, "TRIM_HORIZON")

    def _shards(self) -> list[dict]:
        shards, token = [], None
        while True:
            resp = self.client.list_shards(NextToken=token) if token else self.client.list_shards(StreamName=self.stream)
            shards.extend(resp.get("Shards", []))
            token = resp.get("NextToken")
            if not token:
                return shards

    def _iterator(self, sid: str, kind: str, seq: str | None = None) -> str:
        args = {"StreamName": self.stream, "ShardId": sid, "ShardIteratorType": kind}
        if seq is not None:
            args["StartingSequenceNumber"] = seq
        return self.client.get_shard_iterator(**args)["ShardIterator"]
