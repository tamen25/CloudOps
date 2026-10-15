import urllib.request

from projection.readmodel import ReadModel
from projection.server import serve


def test_health_and_metrics_endpoints():
    model = ReadModel()
    model.apply({"tenantId": "t1", "type": "order.created", "payload": {"total_cents": 500}})
    httpd = serve(model, 0)
    try:
        port = httpd.server_address[1]
        base = f"http://127.0.0.1:{port}"

        with urllib.request.urlopen(f"{base}/healthz") as r:
            assert r.status == 200

        with urllib.request.urlopen(f"{base}/readyz") as r:
            assert r.status == 200

        with urllib.request.urlopen(f"{base}/metrics") as r:
            body = r.read().decode()
            assert r.status == 200
            assert "projection_events_processed_total 1" in body
            assert 'projection_tenant_orders{tenant="t1"} 1' in body
    finally:
        httpd.shutdown()
