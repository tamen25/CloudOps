"""The shard consumer keeps reading through throttling, expired iterators,
resharding and unexpected errors. The Kinesis client is a fake that scripts
each call; nothing reaches AWS. Before the consumer, any of these ended the
process, and the restart began again at LATEST, losing the events between."""

import json

from projection.consumer import ShardConsumer
from projection.readmodel import ReadModel


class ClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


def order(seq, total=100):
    return {"SequenceNumber": seq, "Data": json.dumps({"type": "order.created", "tenantId": "t1", "payload": {"total_cents": total}}).encode()}


class FakeKinesis:
    """get_records answers come from `script`, per shard, in order; an
    Exception in the script is raised instead."""

    def __init__(self, shards, script):
        self.shards = shards
        self.script = {k: list(v) for k, v in script.items()}
        self.iterator_calls = []

    def list_shards(self, **_):
        return {"Shards": self.shards}

    def get_shard_iterator(self, **kw):
        self.iterator_calls.append(kw)
        return {"ShardIterator": f"it-{kw['ShardId']}-{kw['ShardIteratorType']}"}

    def get_records(self, ShardIterator, Limit):
        sid = ShardIterator.split("-")[1]
        step = self.script[sid].pop(0)
        if isinstance(step, Exception):
            raise step
        return step


def consumer(shards, script):
    client = FakeKinesis(shards, script)
    c = ShardConsumer(client, "events", ReadModel())
    c.start()
    return c, client


def test_throttling_is_retried_not_fatal():
    c, _ = consumer([{"ShardId": "s1"}], {"s1": [ClientError("ProvisionedThroughputExceededException"), {"Records": [order("1")], "NextShardIterator": "it-s1-next"}]})
    assert c.poll_once() is True
    assert c.poll_once() is False
    assert c.model.processed == 1


def test_an_expired_iterator_resumes_after_the_last_record_read():
    c, client = consumer([{"ShardId": "s1"}], {"s1": [
        {"Records": [order("41")], "NextShardIterator": "it-s1-next"},
        ClientError("ExpiredIteratorException"),
    ]})
    c.poll_once()
    c.poll_once()
    resume = client.iterator_calls[-1]
    assert resume["ShardIteratorType"] == "AFTER_SEQUENCE_NUMBER"
    assert resume["StartingSequenceNumber"] == "41"


def test_a_closed_shard_hands_over_to_its_children_from_their_start():
    shards = [{"ShardId": "s1"}, {"ShardId": "s2", "ParentShardId": "s1"}, {"ShardId": "s3", "ParentShardId": "s1"}]
    c, client = consumer([shards[0]], {"s1": [{"Records": [order("1")], "NextShardIterator": None}], "s2": [], "s3": []})
    client.shards = shards
    c.poll_once()
    assert set(c.iterators) == {"s2", "s3"}
    assert all(k["ShardIteratorType"] == "TRIM_HORIZON" for k in client.iterator_calls[-2:])


def test_an_unexpected_error_on_one_shard_does_not_stop_the_others():
    c, _ = consumer([{"ShardId": "s1"}, {"ShardId": "s2"}], {
        "s1": [RuntimeError("boom")],
        "s2": [{"Records": [order("1", 250)], "NextShardIterator": "it-s2-next"}],
    })
    c.poll_once()
    assert c.model.by_tenant["t1"].total_cents == 250
