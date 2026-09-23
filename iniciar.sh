#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$APP_DIR/.venv"
STAMP_FILE="$VENV_DIR/.youtube2anki-requirements"

fail() {
  printf 'ERRO: %s\n' "$1" >&2
  exit 1
}

command -v python3 >/dev/null 2>&1 || fail \
  "Python 3 não foi encontrado. No Ubuntu, instale com: sudo apt install python3 python3-venv"

if ! python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 10))'; then
  fail "Youtube2Anki requer Python 3.10 ou mais recente."
fi

if [[ ! -d "$VENV_DIR" ]]; then
  printf 'Preparando o ambiente isolado do Youtube2Anki...\n'
  if ! python3 -m venv "$VENV_DIR"; then
    fail "Não foi possível criar o ambiente virtual. No Ubuntu, execute: sudo apt install python3-venv"
  fi
fi

requirements_hash="$(sha256sum "$APP_DIR/requirements.txt" | cut -d ' ' -f 1)"
installed_hash=""
if [[ -f "$STAMP_FILE" ]]; then
  installed_hash="$(<"$STAMP_FILE")"
fi

if [[ "$requirements_hash" != "$installed_hash" ]]; then
  printf 'Instalando dependências no ambiente isolado...\n'
  "$VENV_DIR/bin/python" -m pip install --disable-pip-version-check -r "$APP_DIR/requirements.txt" || \
    fail "Falha ao instalar as dependências. Verifique sua conexão e tente novamente."
  printf '%s\n' "$requirements_hash" > "$STAMP_FILE"
fi

if [[ "${1:-}" == "--prepare-only" ]]; then
  printf 'Ambiente pronto.\n'
  exit 0
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  printf '\nConfiguração criada em:\n  %s/.env\n\n' "$APP_DIR"
  printf 'Edite AI_API_KEY e, se necessário, AI_BASE_URL e AI_MODEL.\n'
  printf 'Depois, execute este iniciador novamente.\n'
  exit 1
fi

cd "$APP_DIR"
exec "$VENV_DIR/bin/python" app.py
