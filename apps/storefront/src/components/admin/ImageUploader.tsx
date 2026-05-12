"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/ui/status-pill";

type Stage = "idle" | "signing" | "uploading" | "done" | "error";

export function ImageUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setError(null);
    setStage("signing");
    try {
      const sign = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (!sign.ok) {
        const body = (await sign.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `sign_failed_${sign.status}`);
      }
      const { url, key: objectKey } = (await sign.json()) as { url: string; key: string };

      setStage("uploading");
      const put = await fetch(url, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`put_failed_${put.status}`);

      setKey(objectKey);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown");
      setStage("error");
    }
  }

  return (
    <div className="space-y-4">
      <Input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div className="flex items-center gap-3">
        <Button disabled={!file || stage === "signing" || stage === "uploading"} onClick={upload}>
          {stage === "signing" ? "Signing…" : stage === "uploading" ? "Uploading…" : "Upload"}
        </Button>
        {stage === "done" ? <StatusPill variant="success">uploaded</StatusPill> : null}
        {error ? <span className="text-sm text-danger">{error}</span> : null}
      </div>
      {key ? (
        <p className="font-mono text-xs text-fg-muted">
          stored at <span className="text-fg-base">{key}</span> · resize Lambda will emit
          <code className="mx-1">resized/sm</code>,
          <code className="mx-1">resized/md</code>,
          <code className="mx-1">resized/lg</code> shortly.
        </p>
      ) : null}
    </div>
  );
}
