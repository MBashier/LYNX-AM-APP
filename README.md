# Lynx AM — Production & QC Log (Web App)

Mobile-first web app for factory operators to log daily filament production and QC
from their phones. Designed to replace the manual `LYNX REPORTS.xlsx` workbook, while
keeping the same structure and feeding the same weekly finished-spools report.

## What it does

- **Setup** — per-day line, material, target spool weight, tolerances, batch IDs.
- **Production Log** — half-shift target vs actual kg, variance, operator.
- **Hourly Weight Log** — 1 random spool weighed each hour (auto ±0.02 kg check).
- **Hourly Diameter Log** — 1 random spool measured each hour (auto ±0.05 mm check).
- **Color Transitions** — purge/transition spools logged per color change.
- **Daily Summary** — auto-rolls totals, OUT-OF-SPEC counts, transition loss, and a
  **PASS / REVIEW** verdict. Mirrors the `finished_spools_weekly` report.
- **Export CSV** — one tap download that maps straight into the weekly report.

The diameter-tolerance logic backs the public `±0.05mm` claim with real hourly evidence.

## Run locally (Windows PC — operators use same WiFi)

gunicorn is Linux-only, so on Windows use **Waitress** (pure-Python, production-grade):

```bash
cd app
pip install -r requirements.txt waitress
set LYNX_DATA_DIR=%CD%\data
python serve.py
# open http://localhost:5001  (also reachable on your LAN IP, e.g. http://192.168.1.9:5001)
```

The app binds to `0.0.0.0` so any phone on the same WiFi can open the LAN IP.
Keep this PC on while operators are logging. Data persists in `data/lynx.db`.

(For a quick dev check you can also use Flask's built-in server: `python app.py` →
http://127.0.0.1:5000 — but Waitress is the proper always-on option.)

## Run locally (Linux / Mac / cloud)

```bash
pip install -r requirements.txt
export LYNX_DATA_DIR="$(pwd)/data"
gunicorn app:app --bind 0.0.0.0:5000
```

## Deploy to the cloud (operators use a normal URL from anywhere)

### Option A — Render (simplest, free tier)

1. Push this `app/` folder to a GitHub repo.
2. Go to https://render.com → New → Web Service → connect the repo.
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app --bind 0.0.0.0:$PORT`
5. Done. Share the generated URL with operators.

Free tier sleeps when idle (first load ~30s). Data lives on the service disk — export
CSVs regularly, or use a paid plan with a persistent disk for long-term storage.

### Option B — Fly.io (persistent sqlite volume, free)

1. Install Fly CLI, then `fly launch --no-deploy`.
2. `fly volumes create lynx_data --size 1 --region <region>`
3. `fly deploy`
4. The `fly.toml` already mounts a persistent `/data` volume for the database.

## File map

```
app/
├── app.py                 # Flask backend + REST API + CSV export
├── templates/index.html   # mobile UI shell
├── static/style.css       # mobile-first styling
├── static/app.js          # frontend logic (fetch + render)
├── requirements.txt
├── Dockerfile             # for Fly / any container host
├── fly.toml               # Fly deploy config (persistent volume)
├── render.yaml            # Render deploy config
└── data/                 # sqlite db (gitignored; created at runtime)
```

## Operators' daily routine

1. Open the URL on the phone, pick the date.
2. Setup tab → confirm tolerances, enter batch IDs.
3. Through the day: add Production blocks, hourly Weight + Diameter readings, Transitions.
4. End of day: open Summary → it shows totals and PASS/REVIEW.
5. Tap **Export CSV** and drop it into the weekly finished-spools report.

## Notes

- One record per day per date. Multiple operators can use the same shared URL; all
  entries land in the same central database.
- The app is intentionally host-agnostic: SQLite locally, same code on any cloud.
- Keep `LYNX REPORTS_v2.xlsx` as the offline backup/template if WiFi drops.
