#!/usr/bin/env bash

set -Eeuo pipefail

SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_DIR="${YOUTUBE2ANKI_INSTALL_DIR:-$DATA_HOME/youtube2anki}"
BIN_DIR="${YOUTUBE2ANKI_BIN_DIR:-$HOME/.local/bin}"
APPLICATIONS_DIR="${YOUTUBE2ANKI_APPLICATIONS_DIR:-$DATA_HOME/applications}"
LAUNCHER="$BIN_DIR/youtube2anki"
DESKTOP_FILE="$APPLICATIONS_DIR/youtube2anki.desktop"

printf 'Instalando Youtube2Anki em %s\n' "$INSTALL_DIR"
install -d "$INSTALL_DIR" "$BIN_DIR" "$APPLICATIONS_DIR"

install -m 0644 "$SOURCE_DIR/app.py" "$SOURCE_DIR/index.html" \
  "$SOURCE_DIR/requirements.txt" "$SOURCE_DIR/README.md" \
  "$SOURCE_DIR/.env.example" "$INSTALL_DIR/"
install -m 0755 "$SOURCE_DIR/iniciar.sh" "$SOURCE_DIR/desinstalar-linux.sh" "$INSTALL_DIR/"
cp -R "$SOURCE_DIR/server" "$SOURCE_DIR/static" "$INSTALL_DIR/"

if [[ -f "$SOURCE_DIR/.env" && ! -f "$INSTALL_DIR/.env" ]]; then
  install -m 0600 "$SOURCE_DIR/.env" "$INSTALL_DIR/.env"
fi

"$INSTALL_DIR/iniciar.sh" --prepare-only

printf '#!/usr/bin/env bash\nexec %q "$@"\n' "$INSTALL_DIR/iniciar.sh" > "$LAUNCHER"
chmod 0755 "$LAUNCHER"

printf '%s\n' \
  '[Desktop Entry]' \
  'Type=Application' \
  'Name=Youtube2Anki' \
  'Comment=Transforme transcrições do YouTube em baralhos do Anki' \
  "Exec=\"$LAUNCHER\"" \
  'Icon=applications-education' \
  'Terminal=true' \
  'Categories=Education;' \
  'StartupNotify=true' > "$DESKTOP_FILE"
chmod 0644 "$DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

printf '\nInstalação concluída.\n'
printf 'Abra "Youtube2Anki" no menu de aplicativos ou execute: youtube2anki\n'
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  printf 'Na primeira abertura, o app criará o arquivo de configuração e mostrará como preenchê-lo.\n'
fi
