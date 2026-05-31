const NODES = [
  "PR",
  "Lint",
  "Test",
  "Build",
  "Sign",
  "Scan",
  "Plan",
  "Approve",
  "Deploy",
  "Verify",
  "Rollback",
];

export function PipelinePreview() {
  return (
    <div className="font-mono text-[10px]">
      <div className="flex items-center justify-between gap-1 text-fg-muted">
        {NODES.map((n) => (
          <span key={n} className="flex flex-col items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-brand-500/60" />
            <span className="hidden sm:inline">{n}</span>
          </span>
        ))}
      </div>
      <div className="mt-2 h-px w-full bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />
    </div>
  );
}
