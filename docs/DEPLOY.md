# Deploying

The app is a single container (FastAPI serving the built React UI plus the January snapshot). No database, no secrets, no environment variables required.

## Heroku (container stack, recommended: uses the Dockerfile as-is)

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
