const STATES = [
  { id: "reserve", label: "Reserve" },
  { id: "charge", label: "Charge" },
  { id: "fulfill", label: "Fulfill" },
  { id: "email", label: "Email" },
  { id: "done", label: "Done" },
];

export function SagaDiagram() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
      {STATES.map((s, i) => (
        <span key={s.id} className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-border-default bg-bg-raised px-2 py-1 text-fg-base">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {s.label}
          </span>
          {i < STATES.length - 1 ? (
            <span className="text-fg-subtle">→</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
