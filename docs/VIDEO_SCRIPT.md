# Demo video script (max 10 min, unlisted YouTube)

Record the screen with the app open, locally or deployed. Figures are from the January 2026 snapshot at the EPEX 09:20 gate and match the app.

## Part 1: client pitch (about 5 min)

**0:00: the problem (30 s)**
"Every morning the desk has to buy tomorrow's power before the day-ahead auction closes at 09:20. How much to buy depends on how much wind there will be, and all the desk has is a forecast. Two questions: what is the newest forecast we could actually use at that moment, and how wrong has it been?"

**0:30: Desk view (1 min 30 s)**  *(Desk, 15 Jan)*
- Point at the headline: the gate closes on 14 Jan at 09:20, and the newest forecast in hand was published at 07:30.
- Ledger: average 11,610 MW, peak 15,834 MW. Cautious (P10) 8,662 MW, which means wind beats it 9 hours in 10. Cover to hold 2,948 MW.
- Hover across the chart to read a single hour.
- The publications chart: dashed grey lines came out after the gate, so the bid could not use them. Be honest about timing.
- Tick "Show what was metered" to overlay what happened. Enter a demand figure, for example 20,000 MW, and read the "to buy" column.

**2:00: Scorecard (1 min 30 s)**  *(Scorecard)*
- 744 hourly decisions across January. Average miss 2,022 MW, about 18% of output.
- The headline: the forecast ran high in 85% of hours, by 1,746 MW on average. For a buyer that is the expensive direction: 1 hour in 10 the shortfall was 4,154 MW or more.
- The day-by-day chart and the scatter: the dots sit below the diagonal, especially at high wind.
- Lead-time chart: the lean is there even for forecasts made 0 to 3 hours ahead, so it is systematic. A likely cause is curtailment or a scope difference between the datasets. It is a question for the client's data team.

**3:30: so what? (1 min)**  *(back-test block)*
- "We tested a simple correction the honest way. Each day learns only from days already known when the bid was placed. The average miss falls from 2,123 MW to 1,359 MW, a 36% cut, and the 80% band holds in 80% of hours out of sample."
- Gate comparison: closing later barely helps, 2,022 MW at 09:20 against 1,996 MW at 09:50.
- Close: "Next step is a full year of data, and adding demand and price so the buffer turns into pounds."

## Part 2: tech-lead walkthrough (about 5 min)

**0:00: layout (1 min)**  *(README, "Repository layout")*
- One Python package, `backend/windlab`, and one React app, `frontend/src`, built into a single Docker image. Stage one builds the UI and stage two serves the API and the static files.
- No database. The January snapshot lives in `backend/data`, so every run is deterministic and works offline.

**1:00: the ledger and the as-of join (1 min 30 s)**  *(`windlab/ledger.py`, `Ledger.as_of`)*
- The ledger holds every publication and every metered half-hour.
- `as_of` is a `pandas.merge_asof` keyed on target hour, with direction "backward" against the cutoff. It answers "what did we know at this gate?" and nothing else can see a later forecast.
- Test `test_as_of_join_matches_brute_force` checks the join against a plain filter on 60 random hours.

**2:30: pure analytics and the engine (1 min)**  *(`window.py`, `scorecard.py`, `risk.py`, `engine.py`)*
- `window.py` owns the London-time rules. `Gate.cutoff` is the only place a gate time becomes a UTC instant.
- `scorecard.py` and `risk.py` are pure functions over frames. `risk.rolling_backtest` is the honest check on the band.
- `engine.py` memoises each answer per gate and alignment. Each engine has its own memo, so tests share no state.

**3:30: API and frontend (1 min)**  *(`api.py`, `views.py`, `wire.py`, `DeskView.jsx`, `query.js`, `useUrlState.js`)*
- Routes take typed parameters, so an unsupported gate returns 422 and a date outside the window returns 404. `wire.py` turns dataclasses and numpy into JSON and maps NaN to null.
- The URL holds the view, day, gate, alignment, reveal toggle and demand. Links reproduce the same screen.
- `useQuery` keeps the previous answer on screen while the next one loads, and dims it. Nothing blanks while switching days.
- Charts are plain SVG, with no chart library, so the bundle is about 170 kB.

**4:30: practice and gaps (30 s)**
- 17 tests, pinned dependencies, a multi-stage Docker build, and the AI-assistance disclosure in the README.
- Known gaps: one month of data. The in-sample band is flattering, and the back-test is what to rely on. The Docker image and the deployment have not been run yet. There are no frontend tests.
