from fastapi.testclient import TestClient

from inventory.app import create_app

client = TestClient(create_app())


def test_healthz():
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_readyz():
    res = client.get("/readyz")
    assert res.status_code == 200


def test_metrics_exposes_prometheus():
    res = client.get("/metrics")
    assert res.status_code == 200
    assert "inventory_reserve_total" in res.text


def test_reserve_in_stock():
    res = client.post("/reserve", json={"items": [{"sku": "A", "qty": 2}]})
    assert res.status_code == 200
    body = res.json()
    assert body["reserved"] is True
    assert body["lines"][0]["available"] == 100


def test_reserve_rejects_bad_items():
    res = client.post("/reserve", json={"items": [{"sku": "A"}]})
    assert res.status_code == 400
    assert res.json()["error"] == "invalid_items"


def test_reserve_short_stock_via_seed(monkeypatch):
    monkeypatch.setenv("SEED_STOCK", '{"A": 1}')
    app = create_app()
    from fastapi.testclient import TestClient as TC

    c = TC(app)
    res = c.post("/reserve", json={"items": [{"sku": "A", "qty": 5}]})
    assert res.status_code == 200
    assert res.json()["reserved"] is False
