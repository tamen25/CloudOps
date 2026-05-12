"use client";

import { useOrderUpdates, type OrderEventStatus } from "@/lib/ws";
import { StatusPill } from "@/components/ui/status-pill";

const variantForStatus: Record<OrderEventStatus, "info" | "success" | "warning" | "danger"> = {
  received: "info",
  confirmed: "success",
  packed: "warning",
  shipped: "success",
  cancelled: "danger",
};

export function OrderStatusPill({
  orderId,
  initialStatus,
}: {
  orderId: string;
  initialStatus: OrderEventStatus;
}) {
  const state = useOrderUpdates(orderId);
  const status = (state.lastEvent?.payload?.status as OrderEventStatus | undefined) ?? initialStatus;
  const variant = variantForStatus[status] ?? "muted";

  if (state.status === "open" && state.lastEvent) {
    return <StatusPill variant="live">{status}</StatusPill>;
  }
  return <StatusPill variant={variant}>{status}</StatusPill>;
}
