import pytest

from inventory.core import InvalidReservation, ReserveLine, reserve


def test_reserve_all_fulfillable():
    res = reserve([ReserveLine("A", 2), ReserveLine("B", 1)], {"A": 5, "B": 3})
    assert res.reserved is True
    assert len(res.lines) == 2
    assert all(line["ok"] for line in res.lines)


def test_reserve_fails_when_one_line_short():
    res = reserve([ReserveLine("A", 2), ReserveLine("B", 10)], {"A": 5, "B": 3})
    assert res.reserved is False
    assert res.lines[1]["ok"] is False
    assert res.lines[1]["available"] == 3


def test_reserve_unknown_sku_is_zero_stock():
    res = reserve([ReserveLine("ZZZ", 1)], {"A": 5})
    assert res.reserved is False
    assert res.lines[0]["available"] == 0


def test_reserve_rejects_empty():
    with pytest.raises(InvalidReservation):
        reserve([], {"A": 1})


def test_reserve_rejects_non_positive_qty():
    with pytest.raises(InvalidReservation):
        reserve([ReserveLine("A", 0)], {"A": 5})
