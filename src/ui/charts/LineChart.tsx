/**
 * A small SVG line chart for body measurements. X is real time (day numbers), so a week
 * without readings is a gap, not squeezed shut. Y is scaled to the data but never to a
 * span smaller than `minSpan`, so a 0.3 kg wobble can't fill the whole height and look
 * like a dramatic change.
 */
import { Circle, Polyline, Svg } from 'react-native-svg';

export interface ChartPoint {
  x: number; // day number (see src/calc/trend.dayNumber)
  y: number;
}

export interface ChartScale {
  minY: number;
  maxY: number;
  toX: (x: number) => number;
  toY: (y: number) => number;
}

/** The scale a chart of `points` uses — exported so callers can label min/max. */
export function chartScale(
  points: ChartPoint[],
  width: number,
  height: number,
  { minSpan, domain }: { minSpan: number; domain?: [number, number] }
): ChartScale {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = domain?.[0] ?? Math.min(...xs);
  const x1 = domain?.[1] ?? Math.max(...xs);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = 4;
  return {
    minY: lo,
    maxY: hi,
    toX: (x) => (x1 === x0 ? width / 2 : ((x - x0) / (x1 - x0)) * (width - 2 * pad) + pad),
    toY: (y) => height - pad - ((y - lo) / (hi - lo)) * (height - 2 * pad),
  };
}

export function LineChart({
  width,
  height,
  line,
  dots = [],
  color,
  dotColor,
  minSpan,
  domain,
  strokeWidth = 2.2,
  dotRadius = 2,
}: {
  width: number;
  height: number;
  line: ChartPoint[];
  dots?: ChartPoint[];
  color: string;
  dotColor?: string;
  minSpan: number;
  domain?: [number, number];
  strokeWidth?: number;
  dotRadius?: number;
}) {
  const all = [...line, ...dots];
  if (width <= 0 || all.length === 0) return null;
  const s = chartScale(all, width, height, { minSpan, domain });
  const pts = line.map((p) => `${s.toX(p.x).toFixed(1)},${s.toY(p.y).toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height}>
      {dots.map((p, i) => (
        <Circle key={i} cx={s.toX(p.x)} cy={s.toY(p.y)} r={dotRadius} fill={dotColor ?? color} />
      ))}
      {line.length > 1 ? (
        <Polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}
