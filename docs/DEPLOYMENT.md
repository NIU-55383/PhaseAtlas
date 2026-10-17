# Render Web Service deployment

PhaseAtlas now has a Flask WSGI entry point in `app.py`, served by Gunicorn on Render. The server delivers `dist/` and exposes `/healthz`. Scientific computation still runs in the browser. Server-side numerical jobs, accounts, and persistent experiment storage are not implemented yet.

## Existing service settings

Keep the existing PhaseAtlas Web Service. Commit and push the new server files and root requirements to `main` before deploying this configuration.

| Field | Value |
|---|---|
| Service type | Web Service |
| Name | PhaseAtlas |
| Language / Runtime | Python 3 |
| Region | Oregon (US West), keep the existing region |
| Compute Plan | Free for initial verification; a paid instance for continuous availability |
| Source | NIU-55383/PhaseAtlas |
| Branch | main |
| Root Directory | Empty; use the repository root |
| Build Command | `pip install -r requirements.txt` |
| Git Credentials | Keep the account that can access this repository |
| Included Paths | Empty |
| Ignored Paths | Empty |
| Pre-Deploy Command | Empty |
| Start Command | See the exact command below |
| Auto-Deploy | On Commit |
| Deploy Hook | Leave the generated value unchanged |
| Custom Domains | Empty unless you own and want to connect a domain |
| Render Subdomain | Enabled |
| Pull Request Previews | Off |
| Networking | Default settings |
| Edge Caching | Disabled initially; leave unavailable controls unchanged |
| Service Notifications | Only failure notifications, or the matching workspace default |
| Preview Environment Notifications | Disabled |
| Health Check Path | `/healthz` |
| Maintenance Mode | Disabled |
| Persistent Disk | None for this version |
| Secret Files | None |

Start Command (one line):

```sh
gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --access-logfile - --error-logfile -
```

Set the environment variable `PYTHONUNBUFFERED` to `1`. Leave `PORT` to Render, and do not enable Flask debug mode. No API keys or database connection strings are needed for this version.

`dist` is a directory served by `app.py`, not an executable command. This Web Service has no Publish Directory field. `launch.py` remains a local preview tool and is not the Render entry point.

## Deploy and verify

1. Commit and push the changed files, including `app.py`, root `requirements.txt`, deployment notes, tests, and the refreshed research ZIP.
2. Update the existing Render service with the settings above.
3. Select Manual Deploy > Deploy latest commit if saving settings has not already triggered a deploy.
4. Check the logs for Gunicorn binding to `0.0.0.0` on Render's supplied port, and wait for Live status.
5. Open `/healthz`; a healthy deployment returns HTTP 200 and `{"service":"PhaseAtlas","status":"ok"}`.
6. Open the homepage, run a calculation, and check the JSON, PDF, ZIP, and animation downloads.

Free Web Services spin down after 15 minutes without inbound traffic and take approximately a minute to wake. For reliable demonstration availability, choose a paid compute instance when ready. Free instances also have an ephemeral filesystem; later saved experiments need a database or durable storage, and long numerical jobs need a job queue and worker. A Web Service alone does not supply those features.

## Local checks

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests -p test_server.py
```

The route tests cover the English homepage, JavaScript worker MIME types, health status, downloads, video range requests, and rejection of paths outside the public asset directory.

Gunicorn runs on Linux, including Render. On Windows, `python launch.py` remains the dependency-free local website preview. To preview the Flask routes after installing dependencies, use `python -m flask --app app run`; this development command is for local use only.

References: [Render Web Services](https://render.com/docs/web-services), [Render Flask deployment](https://render.com/docs/deploy-flask), [Render health checks](https://render.com/docs/health-checks), [Free instance limitations](https://render.com/docs/free).
