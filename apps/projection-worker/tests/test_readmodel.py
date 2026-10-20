import base64
import json

from projection.readmodel import ReadModel, decode_record


def test_apply_order_created_accumulates():
    rm = ReadModel()
    rm.apply({"tenantId": "t1", "type": "order.created", "payload": {"total_cents": 500}})
    rm.apply({"tenantId": "t1", "type": "order.created", "payload": {"total_cents": 250}})
    assert rm.by_tenant["t1"].orders == 2
    assert rm.by_tenant["t1"].total_cents == 750
    assert rm.processed == 2


def test_apply_skips_unknown_type():
    rm = ReadModel()
    rm.apply({"tenantId": "t1", "type": "cart.updated"})
    assert rm.processed == 0
    assert rm.skipped == 1
    assert "t1" not in rm.by_tenant


def test_apply_defaults_tenant_and_bad_total():
    rm = ReadModel()
    rm.apply({"type": "order.created", "payload": {"total_cents": "oops"}})
    assert rm.by_tenant["default"].orders == 1
    assert rm.by_tenant["default"].total_cents == 0


def test_decode_record_base64_json():
    payload = {"tenantId": "t1", "type": "order.created", "payload": {"total_cents": 100}}
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    assert decode_record({"Data": encoded}) == payload


def test_decode_record_malformed_returns_none():
    assert decode_record({"Data": "!!!not-base64-json!!!"}) is None
    assert decode_record({}) is None


def test_decode_record_boto3_bytes():
    # boto3's get_records hands back Data as the raw bytes, not base64. They
    # used to be base64-decoded again, so the worker skipped every record.
    payload = {"tenantId": "t1", "type": "order.created", "payload": {"total_cents": 100}}
    assert decode_record({"Data": json.dumps(payload).encode()}) == payload
