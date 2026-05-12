/**
 * Lean tech-stack row under the hero. Each chip names a production
 * surface that is actually wired in the repo — keeping the list honest
 * so reviewers can grep the source for proof.
 */
const items = [
  "EKS",
  "Cognito",
  "API Gateway",
  "Lambda",
  "Step Functions",
  "DynamoDB",
  "Kinesis",
  "RDS · Postgres + RLS",
  "CloudFront",
  "S3",
  "OTel",
  "Grafana",
  "Loki",
  "Tempo",
  "Prometheus",
];

export function TechStack() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <div className="space-y-3 border-y border-border-muted/60 py-6">
        <p className="text-xs uppercase tracking-wide text-fg-subtle">
          Built on
        </p>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {items.map((item) => (
            <li
              key={item}
              className="rounded-full border border-border-muted/60 bg-bg-raised/40 px-3 py-1 font-mono text-xs text-fg-muted"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
