# Testing and release checklist

Work through the steps in order. Each step says what a pass looks like. Stop at the first failure and note what you saw.

## 1. Backend tests

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
pytest -q
```

Pass: `17 passed`.

## 2. Frontend builds

```powershell
cd frontend
npm install
npm run build
```

Pass: a `built in` line and no errors.

## 3. Run the whole app locally, the way production runs it

```powershell
cd frontend
npm run build
cd ..\backend
Remove-Item -Recurse -Force static -ErrorAction SilentlyContinue
Copy-Item -Recurse ..\frontend\dist static
uvicorn windlab.api:app --port 8000
```

Open http://localhost:8000. If port 8000 is taken by another app, use `--port 8765` and open that instead.

## 4. Browser checklist

Open http://localhost:8000/?day=2026-01-15 and go through each item.

**Desk**

- The ledger shows: average forecast 11,610 MW, peak 15,834 MW, cautious (P10) 8,662 MW, cover to hold 2,948 MW, since 24 h earlier −311 MW.
- Click another day in the strip. The headline date changes, and the page dims briefly while loading.
- Switch the gate to N2EX 09:50. The headline shows the new gate, and the newest publication becomes 09:30.
- Tick "Show what was metered". An orange line appears, and the Metered and Error columns show up in the table.
- Enter 20000 in the demand box. A "To buy" column appears.
- Move the mouse across the band chart. The readout line shows that hour's values.
- Click Export CSV. A file downloads with 745 lines including the header.
- Reload the page. The same day, gate and toggles are still selected.

**Scorecard**

- Overall MAE is 2,022 MW, bias +1,746 MW, and the 1-in-10 shortfall is 4,154 MW.
- The back-test block says 2,123 MW as forecast falls to 1,359 MW corrected, a 36% reduction over 552 hours.
- All six charts draw. On the gate chart, 09:20 is highlighted.

**Method**

- The text reads correctly, and the snapshot line shows the row counts.

**General**

- The browser console (F12) has no red errors.
- At phone width (about 390 px wide) the page does not scroll sideways. The day strip is the one exception and scrolls on purpose.

## 5. Error handling

With the server running, these should return:

- `/api/desk?day=2025-12-31` returns 404.
- `/api/desk?day=2026-01-15&gate=12:00` returns 422.
- `/api/nothing` returns a 404 JSON response, not the web page.

## 6. Docker (needs Docker Desktop installed)

```powershell
docker compose up --build
```

Open http://localhost:8000 and check http://localhost:8000/api/health. Then repeat the browser checklist from step 4.

Pass: the build finishes and the app behaves as it did in step 3. If the build fails, copy the first error message.

## 7. Refresh the data (optional, needs internet)

Back up `backend\data` first, then run:

```powershell
cd backend
python scripts\fetch_data.py
```

The last run saved 18,104 forecast rows and 1,584 actual half-hours. If the counts or headline figures change, the README numbers need updating before you upload.

---

## Next steps: uploading and deploying

Do these in order.

1. **Pass steps 1 to 5** (and step 6 if Docker is installed).
2. **Create a git repository and make the first commit.** Nothing is under git yet.
   ```powershell
   cd C:\Project\wind-monitor
   git init
   git add .
   git commit -m "Wind desk: first working version"
   ```
3. **Create a public GitHub repository** with a random name, for example `kjhwr-x7q`, as the brief asks. Push to it. Commit history shows your git author name, so check that is acceptable.
4. **Deploy.** Heroku no longer has a free tier, so it needs a paid dyno. The Heroku path uses the Dockerfile. The Vercel path in `DEPLOY.md` has not been tested. Once the app is live, put its URL in the README placeholder, commit and push.
5. **Record the video** against the deployed URL. Upload it to YouTube as unlisted, then add the link to the README.
6. **Submit** the video link, the repository link and the deployed app link.

The video is the first thing the evaluators watch, and the brief says not to submit without it. Pushing to GitHub early is fine, since the brief asks for earlier submissions. Deploy before you record, so the video shows the live app.
