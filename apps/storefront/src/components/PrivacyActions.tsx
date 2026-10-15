"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PrivacyActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<"export" | "erase" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function downloadExport() {
    setBusy("export");
    setMessage(null);
    try {
      const res = await fetch("/api/privacy/export", { cache: "no-store" });
      if (!res.ok) throw new Error("export_failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cloudops-data-export.json";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Your export is downloading.");
    } catch {
      setMessage("We could not prepare your export right now.");
    } finally {
      setBusy(null);
    }
  }

  async function eraseLinkedData() {
    const confirmed = window.confirm(
      "Erase the account-linked data this storefront can remove now? Completed business records stay retained, but the direct user link is removed.",
    );
    if (!confirmed) return;

    setBusy("erase");
    setMessage(null);
    try {
      const res = await fetch("/api/privacy/delete", {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("erase_failed");
      setMessage("Your linked data was erased and you have been signed out.");
      router.push("/login?erased=1");
      router.refresh();
    } catch {
      setMessage("We could not complete erasure right now.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={downloadExport}
          disabled={busy !== null}
        >
          {busy === "export" ? "Preparing export…" : "Download my data"}
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={eraseLinkedData}
          disabled={busy !== null}
        >
          {busy === "erase" ? "Erasing…" : "Erase my linked data"}
        </Button>
      </div>
      {message ? <p className="text-sm text-fg-muted">{message}</p> : null}
    </div>
  );
}
