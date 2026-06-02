import Link from "next/link";
import { CodeBlock } from "./CodeBlock";
import { CognitoDiagram } from "./CognitoDiagram";
import { SearchDiagram } from "./SearchDiagram";
import { RealtimeDiagram } from "./RealtimeDiagram";
import { SagaDiagram } from "./SagaDiagram";

interface TileProps {
  index: string;
  topic: string;
  adr: string;
  href: string;
  title: string;
  body: string;
  className?: string;
  children?: React.ReactNode;
}

function BentoTile({
  index,
  topic,
  adr,
  href,
  title,
  body,
  className,
  children,
}: TileProps) {
  return (
    <Link
      href={href}
      className={`group relative flex flex-col gap-4 rounded-2xl border border-border-default/80 bg-bg-raised/55 p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-[0_30px_80px_-20px_rgba(45,212,191,0.18)] ${
        className ?? ""
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          tile {index} · {topic}
        </p>
        <span className="font-mono text-[10px] text-fg-subtle">{adr}</span>
      </header>
      <h3 className="text-2xl font-medium leading-tight tracking-tight text-fg-base">
        {title}
      </h3>
      <p className="max-w-prose text-sm text-fg-muted">{body}</p>
      {children ? <div className="mt-2 flex-1">{children}</div> : null}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 bottom-4 h-px origin-left scale-x-0 bg-brand-500/60 transition-transform duration-300 group-hover:scale-x-100"
      />
    </Link>
  );
}

export function Bento() {
  return (
    <section className="border-b border-border-muted/60 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          the building blocks
        </p>
        <h2 className="mt-3 max-w-2xl text-4xl font-medium leading-tight tracking-tight text-fg-base sm:text-5xl">
          Five primitives, <span className="display-italic">five guarantees.</span>
        </h2>

        <div className="mt-12 grid auto-rows-[minmax(220px,auto)] grid-cols-1 gap-6 sm:grid-cols-6 lg:grid-cols-12">
          <BentoTile
            index="01"
            topic="multi-tenancy"
            adr="ADR-014"
            href="/platform"
            title="A forgotten WHERE can't leak."
            body="Force-RLS on every customer table. Tenant context is bound at JWT verify and propagates via current_setting('app.tenant_id'). No bypass for the application role."
            className="sm:col-span-6 lg:col-span-8 lg:row-span-2"
          >
            <CodeBlock
              fileName="migrations/003_rls.sql"
              code={`ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id'));
GRANT SELECT, INSERT, UPDATE ON orders TO app_role;
REVOKE BYPASSRLS FROM app_role;`}
              caption="Force-RLS on every customer table — bypass requires the postgres role."
            />
          </BentoTile>

          <BentoTile
            index="02"
            topic="auth"
            adr="ADR-016"
            href="/platform"
            title="JWT, end-to-end."
            body="Cognito issues; middleware verifies; Express trusts the context. JWKS rotates without an app deploy. Every layer carries the same tenant claim."
            className="sm:col-span-6 lg:col-span-4 lg:row-span-2"
          >
            <CognitoDiagram />
          </BentoTile>

          <BentoTile
            index="03"
            topic="search"
            adr="ADR-017"
            href="/architecture#search"
            title="Warm under 100 ms."
            body="Postgres tsvector + GIN. Lambda gateway with JWT authoriser. Identical relevance for the tenant-scoped catalog."
            className="sm:col-span-3 lg:col-span-4"
          >
            <SearchDiagram />
          </BentoTile>

          <BentoTile
            index="04"
            topic="realtime"
            adr="ADR-018"
            href="/architecture#realtime"
            title="Push, not poll."
            body="API Gateway WebSocket, DynamoDB registry, λ fanout. Reconnect with full jitter. Tenant-scoped, sub-aware."
            className="sm:col-span-3 lg:col-span-4"
          >
            <RealtimeDiagram />
          </BentoTile>

          <BentoTile
            index="05"
            topic="saga"
            adr="ADR-019"
            href="/architecture#saga"
            title="Checkout, durable."
            body="Step Functions orchestrates Reserve → Charge → Fulfill → Email. Compensations on every leg. State survives node loss."
            className="sm:col-span-6 lg:col-span-4"
          >
            <SagaDiagram />
          </BentoTile>
        </div>
      </div>
    </section>
  );
}
