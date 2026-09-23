#!/usr/bin/env bash

set -Eeuo pipefail

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_DIR="${YOUTUBE2ANKI_INSTALL_DIR:-$DATA_HOME/youtube2anki}"
BIN_DIR="${YOUTUBE2ANKI_BIN_DIR:-$HOME/.local/bin}"
APPLICATIONS_DIR="${YOUTUBE2ANKI_APPLICATIONS_DIR:-$DATA_HOME/applications}"
LAUNCHER="$BIN_DIR/youtube2anki"
DESKTOP_FILE="$APPLICATIONS_DIR/youtube2anki.desktop"

case "$INSTALL_DIR" in
  */youtube2anki) ;;
  *) printf 'Diretório de instalação inesperado: %s\n' "$INSTALL_DIR" >&2; exit 1 ;;
esac

rm -f -- "$LAUNCHER" "$DESKTOP_FILE"
rm -rf -- "$INSTALL_DIR"

printf 'Youtube2Anki removido.\n'
