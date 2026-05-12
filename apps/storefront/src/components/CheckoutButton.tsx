"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CheckoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const body = (await res.json()) as { executionArn?: string; error?: string };
      if (!res.ok || !body.executionArn) {
        setError(body.error ?? `error ${res.status}`);
        setPending(false);
        return;
      }
      const params = new URLSearchParams({ executionArn: body.executionArn });
      router.push(`/checkout/success?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown");
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error ? <span className="text-sm text-danger">{error}</span> : null}
      <Button onClick={submit} disabled={pending}>
        {pending ? "Starting…" : "Place order"}
      </Button>
    </div>
  );
}
