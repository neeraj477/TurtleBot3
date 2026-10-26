import { useId } from "react";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

/** Minimal line chart for metric cards; draws nothing until two samples exist. */
export function Sparkline({ values, width = 150, height = 34, className }: SparklineProps) {
  const id = useId();
  if (values.length < 2) return <svg width={width} height={height} className={className} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2f7ff6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#2f7ff6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`1,${height} ${pts.join(" ")} ${width - 1},${height}`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke="#3b82f6" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
