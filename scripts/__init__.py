"""Keep existing root-level setup commands working after the backend split."""
from pathlib import Path

__path__ = [str(Path(__file__).resolve().parents[1] / 'backend' / 'scripts')]
