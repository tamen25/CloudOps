"""Inventory reservation core logic — pure, no framework deps so it is unit
testable in isolation. The HTTP layer (app.py) is a thin wrapper over this."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ReserveLine:
    sku: str
    qty: int


@dataclass(frozen=True)
class ReserveResult:
    reserved: bool
    lines: list[dict]


class InvalidReservation(ValueError):
    """Raised when a reservation request is structurally invalid."""


def reserve(lines: list[ReserveLine], stock: dict[str, int]) -> ReserveResult:
    """Reserve each line against available stock.

    A line is fulfillable when stock[sku] >= qty. The reservation succeeds only
    if every line is fulfillable (all-or-nothing). Unknown SKUs are treated as
    zero stock. Returns per-line availability either way so callers can report
    which line failed.
    """
    if not lines:
        raise InvalidReservation("no lines to reserve")

    result_lines: list[dict] = []
    all_ok = True
    for line in lines:
        if line.qty <= 0:
            raise InvalidReservation(f"non-positive qty for sku {line.sku}")
        available = stock.get(line.sku, 0)
        ok = available >= line.qty
        all_ok = all_ok and ok
        result_lines.append({"sku": line.sku, "qty": line.qty, "available": available, "ok": ok})

    return ReserveResult(reserved=all_ok, lines=result_lines)
