import type { LucideIcon } from "lucide-react";

/**
 * AWS-styled service tile. Mirrors the visual cadence of AWS's official
 * architecture icons (rounded square, category-tinted gradient, white
 * glyph centred) without redistributing AWS-owned SVG assets. Use the
 * `category` prop to pick the standard AWS color band.
 */

export type ServiceCategory =
  | "compute"
  | "database"
  | "storage"
  | "networking"
  | "security"
  | "integration"
  | "analytics"
  | "ml"
  | "frontend"
  | "client";

const categoryGradient: Record<ServiceCategory, string> = {
  compute: "from-[#ED7100] to-[#C95A07]",
  database: "from-[#3B48CC] to-[#1F26A8]",
  storage: "from-[#7AA116] to-[#3F8624]",
  networking: "from-[#8C4FFF] to-[#612BB5]",
  security: "from-[#DD344C] to-[#A8232F]",
  integration: "from-[#E7157B] to-[#A50E58]",
  analytics: "from-[#5A4FCF] to-[#3525A0]",
  ml: "from-[#01A88D] to-[#057E69]",
  frontend: "from-[#2dd4bf] to-[#14b8a6]",
  client: "from-[#374151] to-[#1f2937]",
};

interface ServiceTileProps {
  Icon: LucideIcon;
  category: ServiceCategory;
  name: string;
  detail?: string;
  className?: string;
}

export function ServiceTile({
  Icon,
  category,
  name,
  detail,
  className,
}: ServiceTileProps) {
  return (
    <div
      className={`flex min-w-[110px] flex-col items-center gap-2 ${className ?? ""}`}
    >
      <div
        className={`grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br ${categoryGradient[category]} text-white shadow-lg ring-1 ring-white/10`}
      >
        <Icon className="h-6 w-6" strokeWidth={2} />
      </div>
      <div className="space-y-0.5 text-center">
        <div className="text-xs font-medium text-fg-base">{name}</div>
        {detail ? (
          <div className="font-mono text-[10px] leading-tight text-fg-subtle">
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}
