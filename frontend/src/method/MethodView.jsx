import { stamp, ms } from "../data/format.js";

export default function MethodView({ snapshot }) {
  return (
    <article className="method">
      <section>
        <h2><span>01</span> The decision</h2>
        <p>
          The GB day-ahead auction for a delivery day closes the day before: 09:20 London time for EPEX, 09:50 for N2EX.
          Whatever wind forecast exists at that moment is all the desk has to go on.
        </p>
      </section>

      <section>
        <h2><span>02</span> The forecast in hand</h2>
        <p>
          Elexon republishes the national wind forecast several times a day. For each delivery hour this app uses the
          newest publication made at or before the gate. Anything published later is never shown as usable, even on
          the charts, so the numbers match what the desk could actually see.
        </p>
      </section>

      <section>
        <h2><span>03</span> Comparing with what happened</h2>
        <p>
          Metered wind comes from FUELHH every half hour. A forecast is hourly, so by default an hour is compared with
          the half-hour that starts on the hour. The alternative averages the two half-hours inside the hour.
        </p>
        <p>
          Error is forecast minus metered. A positive error means wind fell short and the difference had to be bought
          from somewhere else.
        </p>
      </section>

      <section>
        <h2><span>04</span> The range</h2>
        <p>
          Errors grow with wind, so the model fits separate error quantiles for low, middle and high forecast levels.
          The cautious case is the forecast less the 90th-percentile error; the optimistic case is the forecast less the
          10th. The bias-adjusted middle case removes the typical overshoot.
        </p>
        <p>
          The band on the Desk is fitted on the same January data it is drawn over, so its hit rate is flattering. The
          rolling back-test on the Scorecard is the honest check.
        </p>
      </section>

      <section>
        <h2><span>05</span> Limits</h2>
        <ul>
          <li>National wind only. No demand, price or other fuel data, by design.</li>
          <li>One month of data. That shows the pattern, not a seasonal result.</li>
          <li>
            The demand box is a what-if. It is not a forecast of demand.
          </li>
          {snapshot?.fetchedAt && (
            <li>
              Snapshot: {snapshot.forecastRows?.toLocaleString("en-GB")} forecast rows and{" "}
              {snapshot.actualRows?.toLocaleString("en-GB")} metered half-hours, pulled {stamp(ms(snapshot.fetchedAt))}.
            </li>
          )}
        </ul>
      </section>
    </article>
  );
}
