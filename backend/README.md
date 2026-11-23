# HalicMind backend

`app/` contains the FastAPI API and services, `alembic/` contains application migrations, `catalog/` contains the academic SQL catalog, and `scripts/` contains setup and deployment utilities.

## Render

Use the repository `render.yaml` for a new service. For the existing service, update its settings explicitly:

- Root directory: repository root
- Build command: `pip install -r requirements.txt -c requirements.lock.txt`
- Start command: `python -m scripts.start_production`
- Health check: `/health`

The start command checks/imports the catalog and applies migrations before starting Uvicorn. Existing commands from the repository root remain compatible through small entry-point packages and requirements wrappers, so the current Render service can continue running during the transition.

Configuration comes from environment variables, or the ignored repository-root `.env` for local development. See `../.env.example` and `../docs/deployment.md`. Never commit production configuration files or OAuth client JSON.

Render serves the student interface with `SERVE_FRONTEND=true` and `PUBLIC_ORIGIN=https://halic-mind-source.onrender.com`.

Run tests from the repository root using `.venv/Scripts/python.exe -m pytest -q tests/` on Windows. Use the local test database, never production.
