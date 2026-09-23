"""Leitura do .env e geração do env.js consumido pelo navegador."""

from __future__ import annotations

import json
from pathlib import Path

# Apenas estas chaves são expostas ao navegador via env.js.
BROWSER_KEYS = (
    "AI_API_KEY",
    "AI_BASE_URL",
    "AI_MODEL",
    "AI_TEMPERATURE",
    "AI_MAX_TOKENS",
    "APP_PORT",
)

PLACEHOLDER_KEY = "coloque-sua-chave-aqui"


def load_env(path: Path) -> dict[str, str]:
    """Parser simples de .env: KEY=VALUE, comentários com #, aspas opcionais."""
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export "):].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


def write_env_js(env: dict[str, str], path: Path) -> None:
    config = {key: env.get(key, "") for key in BROWSER_KEYS}
    content = (
        "// Arquivo GERADO automaticamente a partir do .env pelo app.py.\n"
        "// Não edite manualmente e não envie para o git.\n"
        f"window.APP_CONFIG = {json.dumps(config, ensure_ascii=False, indent=2)};\n"
    )
    path.write_text(content, encoding="utf-8")
