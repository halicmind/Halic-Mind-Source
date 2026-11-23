"""Compatibility entry point for existing root-level Render commands."""
from pathlib import Path

__path__ = [str(Path(__file__).resolve().parents[1] / 'backend' / 'app')]
