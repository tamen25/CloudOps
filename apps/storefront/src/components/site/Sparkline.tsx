interface SparklineProps {
  seed: number;
  width?: number;
  height?: number;
  spike?: boolean;
  pattern?: "staircase" | "flat" | "spike" | "zero-bump";
  color?: string;
}

function xorshift(seed: number) {
  let s = seed | 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function generate(seed: number, pattern: SparklineProps["pattern"]): number[] {
  const r = xorshift(seed);
  const n = 12;
  const out: number[] = [];
  switch (pattern) {
    case "staircase": {
      let v = 0.1;
      for (let i = 0; i < n; i++) {
        v += r() * 0.08;
        out.push(Math.min(1, v));
      }
      return out;
    }
    case "spike": {
      for (let i = 0; i < n; i++) {
        out.push(0.25 + r() * 0.1);
      }
      out[Math.floor(n * 0.6)] = 0.92;
      return out;
    }
    case "zero-bump": {
      for (let i = 0; i < n; i++) out.push(0.05 + r() * 0.04);
      out[Math.floor(n * 0.7)] = 0.55;
      return out;
    }
    case "flat":
    default: {
      for (let i = 0; i < n; i++) out.push(0.85 + r() * 0.08);
      return out;
    }
  }
}

export function Sparkline({
  seed,
  width = 80,
  height = 28,
  pattern = "flat",
  color = "#2dd4bf",
}: SparklineProps) {
  const values = generate(seed, pattern);
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${((1 - v) * (height - 4) + 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-7 w-20">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
