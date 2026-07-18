"use client";

import { useId } from "react";
import { cn } from "@/lib/ui/cn";

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  stroke?: string;
  fill?: boolean;
  strokeWidth?: number;
};

/**
 * Lightweight dependency-free SVG sparkline. Scales the series into the
 * viewBox and draws a smooth-ish polyline with an optional soft area fill.
 */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  className,
  stroke = "var(--so-accent)",
  fill = true,
  strokeWidth = 1.5,
}: SparklineProps) {
  const gradientId = useId();
  const points = data.filter((n) => Number.isFinite(n));
  if (points.length < 2) {
    return <div className={cn("h-7", className)} aria-hidden style={{ width }} />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const pad = strokeWidth;
  const usableH = height - pad * 2;

  const coords = points.map((value, i) => {
    const x = i * stepX;
    const y = pad + usableH - ((value - min) / span) * usableH;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      {fill ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.16} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} stroke="none" />
        </>
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
