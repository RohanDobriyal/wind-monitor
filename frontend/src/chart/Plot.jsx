import { useLayoutEffect, useRef, useState } from "react";

const MARGIN = { left: 58, right: 14, top: 12, bottom: 28 };

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth || 640);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/**
 * A plain SVG plot. Children receive scales (`sx`, `sy`) and the plot box, and draw marks.
 * `onHover` is called with the x-domain value under the pointer, or null when it leaves.
 */
export default function Plot({
  height = 260, x, y, xTicks = [], yTicks = [], fmtX = String, fmtY = String, onHover, label, children,
}) {
  const [ref, width] = useWidth();
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const sx = (v) => MARGIN.left + ((v - x[0]) / (x[1] - x[0] || 1)) * innerW;
  const sy = (v) => MARGIN.top + innerH - ((v - y[0]) / (y[1] - y[0] || 1)) * innerH;
  const invertX = (px) => x[0] + ((px - MARGIN.left) / innerW) * (x[1] - x[0]);

  return (
    <div ref={ref} className="plot">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label}
        onMouseMove={onHover ? (e) => onHover(invertX(e.nativeEvent.offsetX)) : undefined}
        onMouseLeave={onHover ? () => onHover(null) : undefined}
      >
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line className="grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={sy(t)} y2={sy(t)} />
            <text className="tick" x={MARGIN.left - 8} y={sy(t)} dy="0.32em" textAnchor="end">{fmtY(t)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} className="tick" x={sx(t)} y={height - 8} textAnchor="middle">{fmtX(t)}</text>
        ))}
        <line className="axis" x1={MARGIN.left} x2={width - MARGIN.right} y1={sy(y[0])} y2={sy(y[0])} />
        {children({ sx, sy, innerW, innerH, left: MARGIN.left, top: MARGIN.top, width })}
      </svg>
    </div>
  );
}

/** Step outline for hourly values: each value holds across its hour. */
export function stepPoints(rows, key, sx, sy, span) {
  const points = [];
  for (const r of rows) {
    const x0 = sx(r.start);
    const x1 = sx(r.start + span);
    const yv = sy(r[key]);
    points.push([x0, yv], [x1, yv]);
  }
  return points;
}

export function linePath(points) {
  return points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
}
