import { useMemo } from "react";
import { useUrlState } from "./shell/useUrlState.js";
import { useQuery } from "./data/query.js";
import DeskView from "./desk/DeskView.jsx";
import ScorecardView from "./scorecard/ScorecardView.jsx";
import MethodView from "./method/MethodView.jsx";
import { Notice } from "./shell/parts.jsx";

const VIEWS = [
  { id: "desk", label: "Desk" },
  { id: "scorecard", label: "Scorecard" },
  { id: "method", label: "Method" },
];

const GATE_LABELS = { "09:20": "EPEX 09:20", "09:50": "N2EX 09:50" };
const ALIGN_LABELS = { exact: "Same half-hour", hourly_mean: "Hourly average" };

export default function App() {
  const catalogQuery = useQuery("/api/catalog");
  const defaults = useMemo(() => ({
    view: "desk",
    day: "2026-01-15",
    gate: "09:20",
    align: "exact",
    reveal: "",
    demand: "",
  }), []);
  const [state, patch] = useUrlState(defaults);
  const catalog = catalogQuery.data;

  return (
    <div className="page">
      <header className="masthead">
        <div className="title">
          <h1>Wind desk</h1>
          <p>Day-ahead wind for the GB power desk, January 2026</p>
        </div>
        {catalog && (
          <div className="controls">
            <Segmented
              label="Gate"
              value={state.gate}
              options={catalog.gates.map((g) => ({ value: g.label, text: GATE_LABELS[g.label] || g.label }))}
              onChange={(gate) => patch({ gate })}
            />
            <Segmented
              label="Actuals"
              value={state.align}
              options={catalog.aligns.map((a) => ({ value: a, text: ALIGN_LABELS[a] }))}
              onChange={(align) => patch({ align })}
            />
            <a className="csv" href={`/api/export.csv?gate=${state.gate}&align=${state.align}`}>
              Export CSV
            </a>
          </div>
        )}
      </header>

      <nav className="views" aria-label="Views">
        {VIEWS.map((v) => (
          <button key={v.id} className={state.view === v.id ? "on" : ""} onClick={() => patch({ view: v.id })}>
            {v.label}
          </button>
        ))}
      </nav>

      <main>
        {catalogQuery.error && <Notice tone="error">Could not reach the data service: {catalogQuery.error}</Notice>}
        {!catalog && !catalogQuery.error && <Notice>Loading the window…</Notice>}
        {catalog && state.view === "desk" && <DeskView state={state} patch={patch} days={catalog.days} />}
        {catalog && state.view === "scorecard" && <ScorecardView state={state} />}
        {catalog && state.view === "method" && <MethodView snapshot={catalog.snapshot} />}
      </main>

      <footer>
        Elexon BMRS: FUELHH wind (actual) and WINDFOR (forecast). Times are London time.
      </footer>
    </div>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      <span className="seg-label">{label}</span>
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? "on" : ""} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.text}
        </button>
      ))}
    </div>
  );
}
