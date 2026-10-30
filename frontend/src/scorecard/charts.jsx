import Plot, { linePath } from "../chart/Plot.jsx";
import { dayOfMonth, kilo, mw, niceTicks } from "../data/format.js";

export function Key({ items }) {
  return (
    <ul className="key">
      {items.map((i) => (
        <li key={i.label}>
          <span className={`swatch ${i.kind}`} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function DailyChart({ rows }) {
  const n = rows.length;
  const top = Math.max(...rows.map((r) => Math.max(r.mae, r.mean_forecast_mw, r.mean_actual_mw))) * 1.08;
  return (
    <Plot
      height={280}
      x={[-0.5, n - 0.5]}
      y={[0, top]}
      xTicks={rows.map((_, i) => i).filter((i) => i % 4 === 0)}
      yTicks={niceTicks(0, top, 4)}
      fmtX={(i) => dayOfMonth(rows[i].date)}
      fmtY={(v) => mw(v)}
      label="Daily averages and error"
    >
      {({ sx, sy, innerW }) => {
        const bar = (innerW / n) * 0.55;
        return (
          <>
            {rows.map((r, i) => (
              <rect key={r.date} className="bar" x={sx(i) - bar / 2} width={bar} y={sy(r.mae)} height={sy(0) - sy(r.mae)}>
                <title>{`${r.date}: MAE ${mw(r.mae)} MW`}</title>
              </rect>
            ))}
            <path className="forecast" d={linePath(rows.map((r, i) => [sx(i), sy(r.mean_forecast_mw)]))} />
            <path className="actual" d={linePath(rows.map((r, i) => [sx(i), sy(r.mean_actual_mw)]))} />
          </>
        );
      }}
    </Plot>
  );
}

export function HourChart({ rows }) {
  const top = Math.max(...rows.map((r) => r.mae)) * 1.08;
  return (
    <Plot
      height={260}
      x={[-0.5, rows.length - 0.5]}
      y={[0, top]}
      xTicks={[0, 3, 6, 9, 12, 15, 18, 21]}
      yTicks={niceTicks(0, top, 4)}
      fmtX={(i) => `${String(rows[i]?.hour ?? i).padStart(2, "0")}:00`}
      fmtY={(v) => mw(v)}
      label="Error by hour of day"
    >
      {({ sx, sy, innerW }) => {
        const bar = (innerW / rows.length) * 0.6;
        return (
          <>
            {rows.map((r, i) => (
              <rect key={r.hour} className="bar" x={sx(i) - bar / 2} width={bar} y={sy(r.mae)} height={sy(0) - sy(r.mae)}>
                <title>{`${String(r.hour).padStart(2, "0")}:00  MAE ${mw(r.mae)}  bias ${mw(r.bias)} MW`}</title>
              </rect>
            ))}
            {rows.map((r, i) => (
              <circle key={`b${r.hour}`} className="dot bias" cx={sx(i)} cy={sy(r.bias)} r="3.2" />
            ))}
          </>
        );
      }}
    </Plot>
  );
}

export function ScatterChart({ pairs }) {
  const top = Math.ceil(Math.max(...pairs.flatMap((p) => [p.forecast_mw, p.actual_mw])) / 1000) * 1000;
  const ticks = niceTicks(0, top, 4);
  return (
    <Plot
      height={300}
      x={[0, top]}
      y={[0, top]}
      xTicks={ticks}
      yTicks={ticks}
      fmtX={kilo}
      fmtY={kilo}
      label="Forecast against actual, hour by hour"
    >
      {({ sx, sy }) => (
        <>
          <line className="diagonal" x1={sx(0)} y1={sy(0)} x2={sx(top)} y2={sy(top)} />
          {pairs.map((p, i) => (
            <circle key={i} className="dot faint" cx={sx(p.forecast_mw)} cy={sy(p.actual_mw)} r="2.4" />
          ))}
        </>
      )}
    </Plot>
  );
}

export function HistogramChart({ bins }) {
  const top = Math.max(...bins.map((b) => b.count)) * 1.1;
  return (
    <Plot
      height={260}
      x={[-0.5, bins.length - 0.5]}
      y={[0, top]}
      xTicks={bins.map((_, i) => i).filter((i) => i % 4 === 0)}
      yTicks={niceTicks(0, top, 4)}
      fmtX={(i) => kilo(bins[i].from_mw)}
      fmtY={(v) => mw(v)}
      label="Distribution of errors"
    >
      {({ sx, sy, innerW }) => {
        const bar = (innerW / bins.length) * 0.9;
        return bins.map((b, i) => (
          <rect
            key={b.from_mw}
            className={b.from_mw >= 0 ? "bar short" : "bar over"}
            x={sx(i) - bar / 2}
            width={bar}
            y={sy(b.count)}
            height={sy(0) - sy(b.count)}
          >
            <title>{`${mw(b.from_mw)} to ${mw(b.to_mw)} MW: ${b.count} hours`}</title>
          </rect>
        ));
      }}
    </Plot>
  );
}

export function LeadChart({ curve, decisionWindow }) {
  const top = Math.ceil(Math.max(...curve.map((c) => c.rmse)) / 500) * 500;
  return (
    <Plot
      height={260}
      x={[0, 66]}
      y={[0, top]}
      xTicks={[0, 12, 24, 36, 48, 60]}
      yTicks={niceTicks(0, top, 4)}
      fmtX={(h) => `${h}h`}
      fmtY={(v) => mw(v)}
      label="Error against forecast lead time"
    >
      {({ sx, sy }) => (
        <>
          <rect
            className="window"
            x={sx(decisionWindow.min_h)}
            width={sx(decisionWindow.max_h) - sx(decisionWindow.min_h)}
            y={sy(top)}
            height={sy(0) - sy(top)}
          />
          <path className="forecast" d={linePath(curve.map((c) => [sx(c.from_h + 1.5), sy(c.mae)]))} />
          <path className="actual" d={linePath(curve.map((c) => [sx(c.from_h + 1.5), sy(c.rmse)]))} />
          {curve.map((c) => (
            <circle key={c.from_h} className="dot" cx={sx(c.from_h + 1.5)} cy={sy(c.mae)} r="2.6">
              <title>{`${c.from_h}–${c.to_h} h ahead: MAE ${mw(c.mae)} MW`}</title>
            </circle>
          ))}
        </>
      )}
    </Plot>
  );
}

export function GateChart({ rows, selected }) {
  const values = rows.map((r) => r.mae);
  const low = Math.floor((Math.min(...values) - 40) / 20) * 20;
  const high = Math.ceil((Math.max(...values) + 40) / 20) * 20;
  return (
    <Plot
      height={260}
      x={[-0.5, rows.length - 0.5]}
      y={[low, high]}
      xTicks={rows.map((_, i) => i).filter((i) => i % 2 === 0)}
      yTicks={niceTicks(low, high, 4)}
      fmtX={(i) => rows[i].gate}
      fmtY={(v) => mw(v)}
      label="Error by gate time"
    >
      {({ sx, sy }) => (
        <>
          <path className="forecast" d={linePath(rows.map((r, i) => [sx(i), sy(r.mae)]))} />
          {rows.map((r, i) => (
            <circle
              key={r.gate}
              className={r.gate === selected ? "dot selected" : "dot"}
              cx={sx(i)}
              cy={sy(r.mae)}
              r={r.gate === selected ? 5 : 3}
            >
              <title>{`${r.gate}: MAE ${mw(r.mae)} MW, lead ${r.mean_lead_h.toFixed(1)} h`}</title>
            </circle>
          ))}
        </>
      )}
    </Plot>
  );
}
