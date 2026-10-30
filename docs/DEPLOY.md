# Deploying

The app is a single container (FastAPI serving the built React UI plus the January snapshot). No database, no secrets, no environment variables required.

## Render (free web service, uses the Dockerfile as-is)

One web service, not two. The Dockerfile builds the React UI and serves it from the same FastAPI process, so frontend and backend deploy together.

1. Push the repository to GitHub.
2. In Render, choose New, then Blueprint, and select the repository. Render reads `render.yaml` (Docker runtime, free plan, health check at `/api/health`).
3. Wait for the build, then open the URL Render gives you. Check `<url>/api/health` returns `{"status":"ok"}`.

Free services sleep after 15 minutes without traffic, and the first visit after that can take about a minute. The disk is temporary, which is fine because the app only reads its committed data.

**Not yet verified:** `render.yaml` has not been tested against Render, and the Docker image has not been built on this machine.

## Heroku (container stack, uses the Dockerfile as-is; paid dyno only)

```bash
heroku login
heroku create                      # or: heroku create <name>
heroku stack:set container
git push heroku main               # builds from heroku.yml -> Dockerfile
heroku open
```

Checks after deploy: `https://<app>.herokuapp.com/api/health` returns `{"status":"ok"}`; the home page opens on the Desk view. First request after a dyno sleep can take a few seconds (the app pre-computes its caches on boot, about 3 s on the development machine: 1.3 s import, 1.5 s warm-up).

## Vercel (alternative)

Vercel does not run Dockerfiles for Python, so use its Python runtime instead:

1. Build the UI: `cd frontend && npm ci && npm run build`, copy `frontend/dist` to `public/`.
2. Add `api/index.py` containing `from backend.windlab.api import app` and a `vercel.json` rewriting `/api/(.*)` to it.
3. `vercel --prod`.

**Not yet verified:** neither deployment path has been run, and the Docker image has not been built (Docker was not installed on the machine this was developed on). The app itself was verified locally (17 tests pass, UI exercised against the real API). Run `docker compose up --build` once before relying on the Dockerfile.
