interface Token {
  kind: "kw" | "fn" | "str" | "num" | "com" | "op" | "id" | "ws";
  value: string;
}

const KW = new Set([
  "ALTER",
  "TABLE",
  "ENABLE",
  "ROW",
  "LEVEL",
  "SECURITY",
  "FORCE",
  "CREATE",
  "POLICY",
  "ON",
  "USING",
  "FOR",
  "ALL",
  "SELECT",
  "FROM",
  "WHERE",
  "INSERT",
  "INTO",
  "VALUES",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "GRANT",
  "REVOKE",
  "SET",
  "CONST",
  "LET",
  "VAR",
  "FUNCTION",
  "RETURN",
  "ASYNC",
  "AWAIT",
  "IF",
  "ELSE",
  "IMPORT",
  "EXPORT",
  "FROM",
  "DEFAULT",
  "TRUE",
  "FALSE",
  "NULL",
  "AND",
  "OR",
  "NOT",
]);

function tokenize(line: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === " " || ch === "\t") {
      let j = i;
      while (j < line.length && (line[j] === " " || line[j] === "\t")) j++;
      out.push({ kind: "ws", value: line.slice(i, j) });
      i = j;
      continue;
    }
    if (line[i] === "-" && line[i + 1] === "-") {
      out.push({ kind: "com", value: line.slice(i) });
      i = line.length;
      continue;
    }
    if (line[i] === "/" && line[i + 1] === "/") {
      out.push({ kind: "com", value: line.slice(i) });
      i = line.length;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < line.length && line[j] !== quote) j++;
      out.push({ kind: "str", value: line.slice(i, Math.min(j + 1, line.length)) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < line.length && /[0-9._]/.test(line[j])) j++;
      out.push({ kind: "num", value: line.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < line.length && /[A-Za-z_0-9]/.test(line[j])) j++;
      const word = line.slice(i, j);
      const upper = word.toUpperCase();
      if (KW.has(upper)) out.push({ kind: "kw", value: word });
      else if (line[j] === "(") out.push({ kind: "fn", value: word });
      else out.push({ kind: "id", value: word });
      i = j;
      continue;
    }
    let j = i;
    while (j < line.length && !/[\sA-Za-z0-9_'"]/.test(line[j])) j++;
    out.push({ kind: "op", value: line.slice(i, j || i + 1) });
    i = Math.max(j, i + 1);
  }
  return out;
}

const COLOR: Record<Token["kind"], string> = {
  kw: "text-brand-400",
  fn: "text-[#a78bfa]",
  str: "text-[#7ee787]",
  num: "text-[#ffa657]",
  com: "text-fg-subtle italic",
  op: "text-fg-muted",
  id: "text-fg-base",
  ws: "",
};

interface CodeBlockProps {
  code: string;
  caption?: string;
  fileName?: string;
  className?: string;
}

export function CodeBlock({ code, caption, fileName, className }: CodeBlockProps) {
  const lines = code.split("\n");
  return (
    <div
      className={`overflow-hidden rounded-lg border border-border-default bg-bg-raised/80 font-mono text-[12px] leading-relaxed ${
        className ?? ""
      }`}
    >
      {fileName ? (
        <div className="flex items-center justify-between border-b border-border-muted px-4 py-2 text-[11px] text-fg-subtle">
          <span>{fileName}</span>
          <span className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-border-default" />
            <span className="h-2 w-2 rounded-full bg-border-default" />
            <span className="h-2 w-2 rounded-full bg-border-default" />
          </span>
        </div>
      ) : null}
      <pre className="overflow-x-auto px-4 py-3">
        <code className="block">
          {lines.map((line, idx) => (
            <div key={idx} className="flex">
              <span className="mr-3 w-6 select-none text-right text-fg-subtle/60">
                {idx + 1}
              </span>
              <span className="whitespace-pre">
                {tokenize(line).map((tok, j) => (
                  <span key={j} className={COLOR[tok.kind]}>
                    {tok.value}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </code>
      </pre>
      {caption ? (
        <div className="border-t border-border-muted px-4 py-2 text-[11px] text-fg-subtle">
          {caption}
        </div>
      ) : null}
    </div>
  );
}
