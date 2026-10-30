import { useState } from "react";
import Plot, { linePath, stepPoints } from "../chart/Plot.jsx";
import { useQuery } from "../data/query.js";
import {
  HOUR, dayLabel, dayOfMonth, hhmm, hourMarks, leadHours, ms, mw, niceTicks, signedMw, stamp,
} from "../data/format.js";
import { Figure, Ledger, Notice } from "../shell/parts.jsx";

export default function DeskView({ state, patch, days }) {
  const url = `/api/desk?day=${state.day}&gate=${state.gate}&align=${state.align}`;
  const { data, error, stale } = useQuery(url);

  if (error) return <Notice tone="error">Could not load this day: {error}</Notice>;
  if (!data) return <Notice>Opening the desk…</Notice>;

  return (
    <section className={stale ? "desk is-stale" : "desk"} aria-busy={stale}>
      <DayStrip days={days} current={state.day} onPick={(day) => patch({ day })} />
      <Headline data={data} stale={stale} />
      <SummaryLedger summary={data.summary} />

      <Figure
        title="The wind you can bid on"
        note="Blue is the newest forecast visible at gate closure. The sand band is the range wind has landed in 80% of comparable hours."
      >
        <BandChart
          hours={data.hours}
          metered={data.metered}
          showActual={state.reveal === "1"}
          demandMw={state.demand === "" ? null : Number(state.demand)}
        />
        <Toggles state={state} patch={patch} />
      </Figure>

      <Figure
        title="How the picture moved"
        note="Each line is one publication for this day. Dashed grey lines came out after the gate, so the bid could not use them."
      >
        <PublicationChart publications={data.publications} start={ms(data.hours[0].target)} />
      </Figure>

      <HourTable hours={data.hours} showActual={state.reveal === "1"} demandMw={state.demand === "" ? null : Number(state.demand)} />
    </section>
  );
}

function DayStrip({ days, current, onPick }) {
  return (
    <nav className="daystrip" aria-label="Delivery day">
      {days.map((d) => (
        <button key={d} className={d === current ? "on" : ""} onClick={() => onPick(d)} aria-pressed={d === current}>
          <span className="dow">{dayLabel(d).split(" ")[0]}</span>
          <span className="dom">{dayOfMonth(d)}</span>
        </button>
      ))}
    </nav>
  );
}

function Headline({ data, stale }) {
  const { gate, summary } = data;
  return (
    <header className="headline">
      <p>
        Bidding for <b>{dayLabel(data.day)}</b>. {gate.name || gate.label} closes{" "}
        <b>{stamp(ms(gate.cutoff))}</b>, and the newest forecast in hand was published{" "}
        <b>{summary.latest_publish ? stamp(ms(summary.latest_publish)) : "—"}</b>.
      </p>
      {stale && <span className="updating">updating</span>}
    </header>
  );
}

function SummaryLedger({ summary }) {
  return (
    <Ledger
      items={[
        { label: "Average forecast", value: mw(summary.avg_forecast_mw), unit: "MW", note: `${mw(summary.energy_mwh / 1000, 1)} GWh for the day` },
        { label: "Peak forecast", value: mw(summary.peak_mw), unit: "MW", note: `lowest hour ${mw(summary.trough_mw)} MW` },
        { label: "Cautious (P10)", value: mw(summary.avg_p10_mw), unit: "MW", note: "wind beats this 9 hours in 10", tone: "caution" },
        { label: "Adjusted (P50)", value: mw(summary.avg_p50_mw), unit: "MW", note: "forecast less its typical overshoot" },
        { label: "Cover to hold", value: mw(summary.avg_cover_mw), unit: "MW", note: "1-in-10 shortfall at this level", tone: "caution" },
        { label: "Since 24 h earlier", value: signedMw(summary.avg_change_24h_mw), unit: "MW", note: "average hourly change" },
      ]}
    />
  );
}

function Toggles({ state, patch }) {
  return (
    <div className="toggles">
      <label>
        <input type="checkbox" checked={state.reveal === "1"} onChange={(e) => patch({ reveal: e.target.checked ? "1" : "" })} />
        Show what was metered
      </label>
      <label>
        Demand you expect
        <input
          type="number" min="0" step="100" placeholder="MW" value={state.demand}
          onChange={(e) => patch({ demand: e.target.value })}
        />
      </label>
    </div>
  );
}

function BandChart({ hours: rows, metered, showActual, demandMw }) {
  const [hover, setHover] = useState(null);
  const t0 = ms(rows[0].target);
  const t1 = t0 + rows.length * HOUR;
  const spanned = rows.map((r) => ({ ...r, start: ms(r.target) }));
  const top = Math.max(...rows.map((r) => r.p90_mw), ...(showActual ? metered.map((m) => m.v) : [])) * 1.06;
  const ticks = niceTicks(0, top, 5);
  const xTicks = hourMarks(t0, t1, 3);
  const hovered = hover == null ? null : spanned[Math.min(spanned.length - 1, Math.max(0, Math.floor((hover - t0) / HOUR)))];

  return (
    <>
      <Readout hovered={hovered} demandMw={demandMw} showActual={showActual} />
      <Plot
        height={300}
        x={[t0, t1]}
        y={[0, top]}
        xTicks={xTicks}
        yTicks={ticks}
        fmtX={hhmm}
        fmtY={(v) => mw(v)}
        onHover={(v) => setHover(v)}
        label="Forecast with 80% range"
      >
        {({ sx, sy, left, top: plotTop, width }) => {
          const upper = stepPoints(spanned, "p90_mw", sx, sy, HOUR);
          const lower = stepPoints(spanned, "p10_mw", sx, sy, HOUR).reverse();
          const forecast = stepPoints(spanned, "forecast_mw", sx, sy, HOUR);
          const actual = metered.filter((m) => m.v != null).map((m) => [sx(ms(m.t)), sy(m.v)]);
          return (
            <>
              <path className="band" d={`${linePath([...upper, ...lower])} Z`} />
              <path className="forecast" d={linePath(forecast)} />
              {showActual && <path className="actual" d={linePath(actual)} />}
              {hovered && (
                <line className="cursor" x1={sx(hovered.start)} x2={sx(hovered.start)} y1={plotTop} y2={sy(0)} />
              )}
              {demandMw != null && (
                <line className="demand" x1={left} x2={width - 14} y1={sy(demandMw)} y2={sy(demandMw)} />
              )}
            </>
          );
        }}
      </Plot>
    </>
  );
}

function Readout({ hovered, demandMw, showActual }) {
  if (!hovered) return <p className="readout muted">Move across the chart to read a single hour.</p>;
  return (
    <p className="readout">
      <b>{hhmm(hovered.start)}</b>
      <span>forecast {mw(hovered.forecast_mw)} MW</span>
      <span>range {mw(hovered.p10_mw)} to {mw(hovered.p90_mw)} MW</span>
      {showActual && hovered.metered_mw != null && <span className="actual-text">metered {mw(hovered.metered_mw)} MW</span>}
      {demandMw != null && <span className="demand-text">buy {mw(Math.max(0, demandMw - hovered.forecast_mw))} MW</span>}
    </p>
  );
}

function PublicationChart({ publications, start }) {
  const all = publications.flatMap((p) => p.points.map((pt) => pt.v));
  const t0 = start;
  const t1 = start + 24 * HOUR;
  const low = Math.min(...all);
  const high = Math.max(...all);
  const yMin = Math.max(0, Math.floor((low - 500) / 1000) * 1000);
  const yMax = Math.ceil((high + 500) / 1000) * 1000;
  const newestUsable = publications.filter((p) => p.usable).at(-1);

  return (
    <Plot
      height={260}
      x={[t0, t1]}
      y={[yMin, yMax]}
      xTicks={hourMarks(t0, t1, 3)}
      yTicks={niceTicks(yMin, yMax, 4)}
      fmtX={hhmm}
      fmtY={(v) => mw(v)}
      label="Forecast publications for the day"
    >
      {({ sx, sy }) =>
        publications.map((p) => {
          const cls = !p.usable ? "pub late" : p === newestUsable ? "pub newest" : "pub usable";
          const d = linePath(p.points.map((pt) => [sx(ms(pt.t)), sy(pt.v)]));
          return (
            <path key={p.publish_time} className={cls} d={d}>
              <title>{`Published ${stamp(ms(p.publish_time))}${p.usable ? "" : " (after the gate)"}`}</title>
            </path>
          );
        })
      }
    </Plot>
  );
}

function HourTable({ hours: rows, showActual, demandMw }) {
  return (
    <div className="hourtable">
      <table>
        <thead>
          <tr>
            <th>Hour</th>
            <th>Forecast</th>
            <th>P10</th>
            <th>P50</th>
            <th>P90</th>
            <th>Cover</th>
            <th>Since 24 h</th>
            <th>Lead</th>
            {demandMw != null && <th>To buy</th>}
            {showActual && <th>Metered</th>}
            {showActual && <th>Error</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.target}>
              <td>{hhmm(ms(r.target))}</td>
              <td className="strong">{mw(r.forecast_mw)}</td>
              <td>{mw(r.p10_mw)}</td>
              <td>{mw(r.p50_mw)}</td>
              <td>{mw(r.p90_mw)}</td>
              <td>{mw(r.cover_mw)}</td>
              <td className={r.change_24h_mw > 0 ? "up" : r.change_24h_mw < 0 ? "down" : ""}>{signedMw(r.change_24h_mw)}</td>
              <td>{leadHours(r.lead_h)}</td>
              {demandMw != null && <td>{mw(Math.max(0, demandMw - r.forecast_mw))}</td>}
              {showActual && <td>{mw(r.metered_mw)}</td>}
              {showActual && <td className={r.error_mw > 0 ? "down" : "up"}>{signedMw(r.error_mw)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        P10 is the cautious case, P90 the optimistic one. Cover is the shortfall to hold against at that forecast level.
        {" "}Error is forecast minus metered, so a positive number means wind fell short.
      </p>
    </div>
  );
}
