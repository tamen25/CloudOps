const LAYERS = [
  { id: "waf", label: "WAF", note: "rate · OWASP" },
  { id: "tls", label: "TLS / HSTS", note: "edge" },
  { id: "auth", label: "JWT verify", note: "JWKS rotate" },
  { id: "rls", label: "Postgres RLS", note: "force" },
  { id: "audit", label: "Audit log", note: "append-only" },
];

export function DefenseDiagram() {
  return (
    <ul className="flex flex-col gap-1.5 font-mono text-[11px]">
      {LAYERS.map((l, i) => (
        <li
          key={l.id}
          className="flex items-center justify-between gap-3 rounded-md border border-border-default bg-bg-raised/60 px-3 py-1.5"
        >
          <span className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-sm border border-border-default text-[10px] text-fg-subtle">
              {i + 1}
            </span>
            <span className="text-fg-base">{l.label}</span>
          </span>
          <span className="text-fg-subtle">{l.note}</span>
        </li>
      ))}
    </ul>
  );
}
