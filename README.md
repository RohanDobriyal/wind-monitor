# Wind desk

A pilot for a GB power desk that buys electricity on the day-ahead market. It answers two questions about national wind generation, using only Elexon data:

1. **What wind forecast could the desk see when it had to bid?**
2. **How far off was that forecast, in MW?** The answer is the risk the desk carries into each purchase.

Scope is purchase decisions made in **January 2026**, which means delivery days 2 January to 1 February 2026.

> **AI disclosure:** the code, tests and documentation were drafted with an AI coding assistant (Claude, via Claude Code). The domain choices, the gate times and the findings were checked by hand against the data.

**Live app:** `<ADD YOUR HEROKU URL HERE AFTER DEPLOYING>` (see [Deploy](#deploy))

---

## The idea

The day-ahead auction for a delivery day closes the day before. EPEX closes at 09:20 London time and N2EX at 09:50. Elexon republishes the wind forecast about eight times a day, so the desk always has a newest forecast, but never a perfect one.

The app is built on one rule. For each delivery hour it uses the **newest forecast published at or before the gate**, and nothing later. Every accuracy figure is therefore what the desk could actually see at the time, not what a better-informed observer would have known.

## Headline findings (January 2026, EPEX gate)

- **Average miss: 2,022 MW**, about 18% of output. RMSE is 2,497 MW.
- **The forecast ran high in 85% of hours.** The average lean is +1,746 MW. Wind fell short of the forecast, which is the expensive direction. In 1 hour in 10 the shortfall was 4,154 MW or more.
- **The lean shows up even for forecasts made 0 to 3 hours ahead** (about +1,467 MW). It is not just a long-range problem. Metered output never exceeded 17.8 GW in January, while forecasts reached 21.4 GW. This looks like curtailment or a scope difference between the datasets, but two datasets cannot prove the cause. It is a question for the client.
- **A correction learned only from earlier days helps out of sample.** Each day is priced with a correction fitted on days already known at bid time. The average miss falls from 2,123 MW to 1,359 MW (−36%), and the 80% band holds in 80% of hours.
- **Closing later barely helps.** The average miss is 2,022 MW at 09:20 and 1,996 MW at 09:50.

## Using the app

The app has three views.

- **Desk** is the bid-day view. Pick a delivery day from the strip. It shows the newest forecast visible at the gate, a cautious case (P10), an adjusted case (P50), an optimistic case (P90) and the "cover to hold" figure, which is the 1-in-10 shortfall. The publications chart shows which forecasts were usable and which came out after the gate. Tick "Show what was metered" to overlay what actually happened. Enter an expected demand to see how much remains to buy at each hour. Hover over the chart to read one hour.
- **Scorecard** is the accuracy view. It covers the overall error, error by day, by hour and by forecast level, the lead-time curve, the gate comparison and the rolling back-test.
- **Method** explains the definitions, the sign convention and the limits.

The gate and actuals alignment switches sit in the header. The state lives in the URL, so a link opens the same view.

## Method

- **Decision-time forecast.** A delivery hour's cutoff is the gate on the day before, in London time. The newest publication at or before that cutoff is the forecast in hand. This is an as-of join, implemented in [`backend/windlab/ledger.py`](backend/windlab/ledger.py), and a test checks it against a brute-force filter.
- **Alignment.** WINDFOR is hourly and FUELHH is half-hourly. By default an hour is compared with the half-hour starting on the hour. The alternative averages the two half-hours.
- **Error.** `error = forecast − metered`. A positive number means wind fell short.
- **Ranges.** Errors grow with wind, so quantiles of the error are fitted separately for three forecast levels. P10 = forecast − q90(error), P50 = forecast − q50, P90 = forecast − q10. The cover-to-hold figure is q90.
- **Back-test.** For each day, the fit uses only days whose actuals were known when that day's bid was placed (two or more days earlier). The first scored day is 10 January.
- **Gate times** are 09:20 (EPEX GB day-ahead) and 09:50 (N2EX) London time, taken from public sources. Confirm them against the current exchange rulebooks before using them operationally.
- **Limits.** National wind only. No demand or price data. One month of data. The in-sample band is flattering, so the back-test is the figure to rely on. The demand input is a what-if.

## Repository layout

```
.
├── Dockerfile                   two stages: build the UI, then run the API that serves it
├── docker-compose.yml           `docker compose up` → http://localhost:8000
├── heroku.yml                   Heroku container-stack config
├── backend/
│   ├── windlab/
│   │   ├── window.py            delivery calendar, gate closures, the hourly grid
│   │   ├── ledger.py            the forecast ledger and the as-of join
│   │   ├── risk.py              error tiers, bands, rolling back-test
│   │   ├── scorecard.py         accuracy statistics and breakdowns
│   │   ├── engine.py            prices the ledger and memoises each answer
│   │   ├── views.py             shapes answers for the Desk, Scorecard and CSV
│   │   ├── wire.py              dataclasses and numpy → JSON, NaN → null
│   │   └── api.py               routes, query validation, UI serving, cache warm-up
│   ├── data/                    January 2026 snapshot (JSON) and its metadata
│   ├── scripts/fetch_data.py    re-download the snapshot from Elexon
│   ├── tests/test_windlab.py    17 tests: calendar, as-of join, no look-ahead, scoring, API
│   └── requirements*.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              masthead, controls, view switch
│   │   ├── desk/DeskView.jsx    the bid-day view
│   │   ├── scorecard/           the accuracy view and its charts
│   │   ├── method/MethodView.jsx
│   │   ├── chart/Plot.jsx       plain SVG plot and the step-line helpers
│   │   ├── data/                query cache with stale-while-revalidate; formatting and axis maths
│   │   ├── shell/               URL-backed state; shared figure, ledger and notice parts
│   │   └── styles.css
└── docs/
    ├── VIDEO_SCRIPT.md          talking points for the two-part demo
    └── DEPLOY.md                Heroku and Vercel notes
```

## Architecture

**Backend.** Data flows one way through four layers.

1. **Ledger** (`ledger.py`) holds every publication and every metered half-hour. Its `as_of` method answers "what did we know at this cutoff?" with a point-in-time join.
2. **Pure analytics** (`window.py`, `risk.py`, `scorecard.py`) take frames or values and return numbers. They touch no global state.
3. **Engine and views** (`engine.py`, `views.py`) combine the ledger with the analytics and memoise each answer per gate and alignment. Each engine has its own memo, so tests are isolated.
4. **HTTP** (`api.py`, `wire.py`) validates parameters, converts results to JSON and serves the built UI. Invalid gates and alignments get a 422 from the type annotations, and dates outside the window get a 404.

**Frontend.** A Vite single-page app with no router and no chart library.

- The URL holds the view, day, gate, alignment, reveal toggle and demand, so every state can be shared as a link.
- `useQuery` caches each request and keeps the previous answer on screen while the next one loads, dimming it. Switching days never shows a blank panel.
- Charts are plain SVG built by a small `Plot` component. A hover readout replaces tooltips on the main chart.

## Run it

### Docker

```bash
docker compose up --build
# open http://localhost:8000
```

### Local development

```bash
# API (Python 3.12+)
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
pytest                                                  # 17 tests
uvicorn windlab.api:app --reload --port 8000

# UI (Node 20+), in a second terminal
cd frontend
npm install
npm run dev                                             # http://localhost:5173, proxies /api to :8000
```

### Refresh the data

The January snapshot is committed, so the app runs offline. To re-download it from Elexon, no API key is needed:

```bash
cd backend && python scripts/fetch_data.py
```

## API

| Endpoint | What it returns |
|---|---|
| `GET /api/catalog` | delivery days, gates, alignments, window and snapshot metadata |
| `GET /api/desk?day=2026-01-15&gate=09:20&align=exact` | one delivery day: hourly plan, publications, metered half-hours, summary |
| `GET /api/scorecard?gate=09:20&align=exact` | overall accuracy, breakdowns, lead-time curve, gate comparison, back-test |
| `GET /api/export.csv?gate=09:20&align=exact` | one row per delivery hour: target, publication, lead, forecast, actual, error |
| `GET /api/health` | liveness |

Interactive docs are at `/docs`.

## Deploy

The container reads `$PORT`, so it runs unchanged on Heroku's container stack. See [`docs/DEPLOY.md`](docs/DEPLOY.md).

```bash
heroku create
heroku stack:set container
git push heroku main
```

Then paste the app URL at the top of this README.
