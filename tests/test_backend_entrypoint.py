"""Both current Render commands and backend-only deployments must keep booting."""
import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize('directory', ['.', 'backend'])
def test_api_starts_without_serving_frontend(directory):
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run([sys.executable, '-c', (
        "from fastapi.testclient import TestClient; from app.main import app; "
        "c=TestClient(app); r=c.get('/'); assert r.status_code==200; "
        "assert r.json()['service']=='api'; assert c.get('/assets/app.js').status_code==404; "
        "assert c.get('/api/v1/ui-config').status_code==200; assert c.get('/docs').status_code==200"
    )], cwd=root / directory, env={**os.environ, 'SERVE_FRONTEND': 'false'},
        capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr
