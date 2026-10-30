import { useQuery } from "../data/query.js";
import { dayLabel, mw, pct, signedMw } from "../data/format.js";
import { Figure, Ledger, Notice } from "../shell/parts.jsx";
import { DailyChart, GateChart, HistogramChart, HourChart, Key, LeadChart, ScatterChart } from "./charts.jsx";

export default function ScorecardView({ state }) {
  const { data, error, stale } = useQuery(`/api/scorecard?gate=${state.gate}&align=${state.align}`);

  if (error) return <Notice tone="error">Could not load the scorecard: {error}</Notice>;
  if (!data) return <Notice>Pricing January…</Notice>;

  const o = data.overall;
  const bt = data.backtest;
  const leanWord = o.bias > 0 ? "above" : "below";

  return (
    <section className={stale ? "scorecard is-stale" : "scorecard"} aria-busy={stale}>
      <header className="headline">
        <p>
          {o.n} delivery hours, each priced against the newest forecast visible at {data.gate.label}. On average the
          forecast sat <b>{mw(Math.abs(o.bias))} MW {leanWord}</b> what was metered, so a positive error means wind fell short.
        </p>
      </header>

      <Ledger
        items={[
          { label: "Mean absolute error", value: mw(o.mae), unit: "MW", note: `${pct(o.wape_pct)} of average output` },
          { label: "Root mean square", value: mw(o.rmse), unit: "MW", note: "penalises the big misses" },
          { label: "Bias", value: signedMw(o.bias), unit: "MW", note: "systematic lean", tone: "caution" },
          { label: "1-in-10 shortfall", value: mw(o.p90_shortfall), unit: "MW", note: "forecast over actual", tone: "caution" },
          { label: "Worst hour", value: mw(o.max_abs_error), unit: "MW", note: `95% of hours within ±${mw(o.p95_abs_error)}` },
          { label: "Inside the 80% band", value: pct(data.band_hit_pct, 0), note: "in-sample, so flattering" },
        ]}
      />

      {bt && (
        <Figure
          title="Would correcting the lean have helped?"
          note={`Each day is priced only with a correction learned from days already known when its bid was placed, starting ${dayLabel(bt.from_day)}.`}
        >
          <Ledger
            items={[
              { label: "MAE, as forecast", value: mw(bt.mae_raw), unit: "MW", note: `bias ${signedMw(bt.bias_raw)} MW` },
              { label: "MAE, corrected", value: mw(bt.mae_adjusted), unit: "MW", note: `bias ${signedMw(bt.bias_adjusted)} MW`, tone: "good" },
              { label: "Error removed", value: pct(bt.error_reduction_pct, 0), note: `over ${bt.hours} out-of-sample hours`, tone: "good" },
              { label: "Inside the 80% band", value: pct(bt.hit_pct, 0), note: "out of sample, target 80%" },
            ]}
          />
        </Figure>
      )}

      <div className="grid">
        <Figure title="Day by day" note="Bars: mean absolute error. Lines: average forecast and average metered wind.">
          <Key items={[
            { label: "MAE", kind: "bar" },
            { label: "Forecast", kind: "forecast" },
            { label: "Metered", kind: "actual" },
          ]} />
          <DailyChart rows={data.by_day} />
        </Figure>

        <Figure title="Hour of the day" note="Bars: mean absolute error. Dots: bias. Dots above zero mean the forecast ran high.">
          <HourChart rows={data.by_hour} />
        </Figure>

        <Figure title="Forecast against metered" note="Each dot is one hour. Points under the diagonal are over-forecasts.">
          <ScatterChart pairs={data.pairs} />
        </Figure>

        <Figure title="How big the misses were" note="Blue: wind came in above forecast. Rust: below forecast, the costly direction.">
          <HistogramChart bins={data.histogram} />
        </Figure>

        <Figure title="Lead time" note="Error by how many hours before delivery the forecast was published. The shaded strip is where day-ahead bids sit.">
          <Key items={[
            { label: "MAE", kind: "forecast" },
            { label: "RMSE", kind: "actual" },
            { label: "Day-ahead window", kind: "window" },
          ]} />
          <LeadChart curve={data.lead_curve} decisionWindow={data.lead} />
        </Figure>

        <Figure title="Does the gate time matter?" note="MAE for each gate. The axis is zoomed, so the gaps look bigger than they are.">
          <GateChart rows={data.gate_curve} selected={data.gate.label} />
        </Figure>
      </div>

      <Figure title="Error by forecast level" note="Wind errors grow with wind, so the risk band is set per level. The quartiles below are where the bands come from.">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Forecast level</th><th>Hours</th><th>MAE</th><th>Bias</th><th>RMSE</th><th>1-in-10 shortfall</th><th>P10 error</th>
              </tr>
            </thead>
            <tbody>
              {data.by_level.map((r) => (
                <tr key={r.lo_mw}>
                  <td>{mw(r.lo_mw)} to {mw(r.hi_mw)} MW</td>
                  <td>{r.n}</td>
                  <td>{mw(r.mae)}</td>
                  <td className={r.bias > 0 ? "down" : "up"}>{signedMw(r.bias)}</td>
                  <td>{mw(r.rmse)}</td>
                  <td>{mw(r.p90_shortfall)}</td>
                  <td>{signedMw(r.p10_error)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Figure>
    </section>
  );
}
