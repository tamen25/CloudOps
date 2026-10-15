"use client";

import { useEffect, useState } from "react";
import { useMouseParallax } from "./useMouseParallax";

const PODS = [
  { id: "order", ring: 0, angle: 18 },
  { id: "front", ring: 0, angle: 162 },
  { id: "ws", ring: 0, angle: 306 },
  { id: "search", ring: 1, angle: 60 },
  { id: "otel", ring: 1, angle: 210 },
  { id: "audit", ring: 1, angle: 330 },
  { id: "image", ring: 2, angle: 100 },
  { id: "sched", ring: 2, angle: 260 },
] as const;

const RINGS = [
  { rx: 240, ry: 130 },
  { rx: 360, ry: 190 },
  { rx: 480, ry: 250 },
];

function polar(rx: number, ry: number, deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  return { x: rx * Math.cos(r), y: ry * Math.sin(r) };
}

export function ClusterOrbit() {
  const [activeIdx, setActiveIdx] = useState(0);
  const { x: px, y: py } = useMouseParallax(10);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => {
      setActiveIdx((i) => (i + 1) % PODS.length);
    }, 900);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden"
      style={{ opacity: 0.62 }}
    >
      <svg
        viewBox="-560 -320 1120 640"
        className="h-full w-full max-w-[1400px]"
        style={{
          transform: `translate3d(${px}px, ${py}px, 0)`,
          transition: "transform 240ms ease-out",
        }}
      >
        <defs>
          <radialGradient id="orbit-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#2dd4bf" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="orbit-pod" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5eead4" stopOpacity="1" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.4" />
          </radialGradient>
          {RINGS.map((r, i) => (
            <path
              key={i}
              id={`ring-${i}`}
              d={`M ${-r.rx} 0 A ${r.rx} ${r.ry} 0 1 0 ${r.rx} 0 A ${r.rx} ${r.ry} 0 1 0 ${-r.rx} 0`}
              fill="none"
            />
          ))}
        </defs>

        {/* Core glow */}
        <circle cx="0" cy="0" r="180" fill="url(#orbit-core)" />
        <circle
          cx="0"
          cy="0"
          r="18"
          fill="#2dd4bf"
          opacity="0.9"
          data-motion="orbit"
        >
          <animate
            attributeName="r"
            values="14;22;14"
            dur="3.2s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Rings */}
        {RINGS.map((r, i) => (
          <ellipse
            key={i}
            cx="0"
            cy="0"
            rx={r.rx}
            ry={r.ry}
            fill="none"
            stroke="#30363d"
            strokeWidth="1"
            strokeDasharray="2 6"
            opacity={0.55 - i * 0.08}
          />
        ))}

        {/* Pods */}
        {PODS.map((pod, idx) => {
          const ring = RINGS[pod.ring];
          const { x, y } = polar(ring.rx, ring.ry, pod.angle);
          const active = idx === activeIdx;
          return (
            <g key={pod.id} transform={`translate(${x}, ${y})`}>
              <line
                x1="0"
                y1="0"
                x2={-x * 0.4}
                y2={-y * 0.4}
                stroke="#2dd4bf"
                strokeWidth="0.6"
                opacity={active ? 0.45 : 0.12}
              />
              <circle
                r={active ? 12 : 9}
                fill="url(#orbit-pod)"
                opacity={active ? 1 : 0.7}
                style={{
                  transition: "r 220ms ease-out, opacity 220ms ease-out",
                }}
              />
              {active ? (
                <circle
                  r="9"
                  fill="none"
                  stroke="#2dd4bf"
                  strokeWidth="1"
                  opacity="0.6"
                  data-motion="orbit"
                >
                  <animate
                    attributeName="r"
                    values="9;30;9"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.6;0;0.6"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </circle>
              ) : null}
              <text
                y="-18"
                textAnchor="middle"
                fontSize="10"
                fontFamily="var(--font-mono)"
                fill={active ? "#5eead4" : "#687480"}
                style={{ transition: "fill 220ms ease-out" }}
              >
                {pod.id}
              </text>
            </g>
          );
        })}

        {/* Packet circles along spokes */}
        {PODS.slice(0, 4).map((pod, i) => {
          const ring = RINGS[pod.ring];
          const { x, y } = polar(ring.rx, ring.ry, pod.angle);
          return (
            <circle
              key={pod.id}
              r="2.2"
              fill="#5eead4"
              opacity="0.85"
              data-motion="orbit"
            >
              <animate
                attributeName="cx"
                values={`0;${x};0`}
                dur={`${4 + i * 0.7}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="cy"
                values={`0;${y};0`}
                dur={`${4 + i * 0.7}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;0.85;0"
                dur={`${4 + i * 0.7}s`}
                repeatCount="indefinite"
              />
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
