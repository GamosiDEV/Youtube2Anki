#!/usr/bin/env python3
"""Youtube2Anki - servidor local.

Uso:  python app.py

- Lê o .env e gera o env.js consumido pela página.
- Serve o index.html e os arquivos de static/.
- Expõe a API usada pela página:
    GET  /api/health
    GET  /api/languages?url=...          idiomas de transcrição disponíveis
    GET  /api/transcript?url=...&lang=xx transcrição no idioma escolhido
    POST /api/apkg                       gera o pacote .apkg a partir dos cards
"""

from __future__ import annotations

import json
import mimetypes
import re
import subprocess
import sys
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
ENV_PATH = ROOT / ".env"
ENV_JS_PATH = ROOT / "env.js"
MAX_BODY_BYTES = 5 * 1024 * 1024


def ensure_dependencies() -> None:
    """Instala as dependências do requirements.txt caso estejam faltando."""
    try:
        import genanki  # noqa: F401
        import youtube_transcript_api  # noqa: F401
        return
    except ImportError:
        pass

    print("Instalando dependências (requirements.txt)...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", str(ROOT / "requirements.txt")],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stderr.strip())
        sys.exit("ERRO: não foi possível instalar as dependências. Rode: python -m pip install -r requirements.txt")


ensure_dependencies()

from server.anki_export import build_apkg  # noqa: E402
from server.config import PLACEHOLDER_KEY, load_env, write_env_js  # noqa: E402
from server.transcript import TranscriptError, fetch_transcript, list_languages  # noqa: E402


class Handler(BaseHTTPRequestHandler):
    server_version = "Youtube2Anki"
    port: int = 8765

    # ---------- utilidades ----------

    def log_message(self, fmt: str, *args) -> None:
        if self.path.startswith("/api/"):
            sys.stderr.write(f"[{self.log_date_time_string()}] {fmt % args}\n")

    def _allowed_origin(self) -> str | None:
        origin = self.headers.get("Origin")
        if origin == "null":  # index.html aberto direto do disco (file://)
            return origin
        if origin and re.fullmatch(rf"http://(localhost|127\.0\.0\.1):{self.port}", origin):
            return origin
        return None

    def _host_ok(self) -> bool:
        # Protege contra DNS rebinding: só aceita acessos via localhost.
        host = (self.headers.get("Host") or "").lower()
        return host in {f"localhost:{self.port}", f"127.0.0.1:{self.port}"}

    def _send(self, status: int, body: bytes, content_type: str, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self._allowed_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Expose-Headers", "Content-Disposition")
            self.send_header("Vary", "Origin")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload: dict) -> None:
        self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _error(self, status: int, code: str, message: str) -> None:
        self._json(status, {"ok": False, "error": code, "message": message})

    # ---------- métodos HTTP ----------

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        origin = self._allowed_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Vary", "Origin")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        if not self._host_ok():
            return self._error(403, "FORBIDDEN_HOST", "Acesse via http://localhost.")

        parsed = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        route = parsed.path

        if route == "/api/health":
            return self._json(200, {"ok": True})
        if route == "/api/languages":
            return self._transcript_call(lambda: list_languages(query.get("url", "")))
        if route == "/api/transcript":
            return self._transcript_call(lambda: fetch_transcript(query.get("url", ""), query.get("lang", "")))

        self._serve_static(route)

    def do_POST(self) -> None:
        if not self._host_ok():
            return self._error(403, "FORBIDDEN_HOST", "Acesse via http://localhost.")
        if urlparse(self.path).path != "/api/apkg":
            return self._error(404, "NOT_FOUND", "Rota não encontrada.")

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            return self._error(413, "INVALID_BODY", "Corpo da requisição ausente ou grande demais.")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            cards = payload.get("cards") or []
            if not isinstance(cards, list):
                raise ValueError("'cards' deve ser uma lista.")
            data = build_apkg(str(payload.get("deck_name") or ""), cards)
        except (ValueError, json.JSONDecodeError) as exc:
            return self._error(400, "INVALID_CARDS", str(exc))
        except Exception as exc:  # pragma: no cover - guarda defensiva
            return self._error(500, "APKG_FAILED", f"Falha ao gerar o .apkg: {exc}")

        self._send(200, data, "application/octet-stream")

    # ---------- handlers ----------

    def _transcript_call(self, fn) -> None:
        try:
            self._json(200, {"ok": True, **fn()})
        except TranscriptError as exc:
            self._error(exc.status, exc.code, exc.message)
        except Exception as exc:  # pragma: no cover - guarda defensiva
            self._error(500, "UNEXPECTED_ERROR", f"Erro inesperado: {exc}")

    def _serve_static(self, route: str) -> None:
        if route in ("/", "/index.html"):
            target = ROOT / "index.html"
        elif route == "/env.js":
            # O env.js contém a chave da API: só é entregue para a própria página
            # (impede que outros sites o carreguem via <script src>).
            if self.headers.get("Sec-Fetch-Site", "same-origin") not in ("same-origin", "none"):
                return self._error(403, "FORBIDDEN", "Acesso negado.")
            target = ENV_JS_PATH
        elif route.startswith("/static/"):
            target = (STATIC_DIR / route[len("/static/"):]).resolve()
            if STATIC_DIR not in target.parents:
                return self._error(404, "NOT_FOUND", "Arquivo não encontrado.")
        else:
            return self._error(404, "NOT_FOUND", "Arquivo não encontrado.")

        if not target.is_file():
            return self._error(404, "NOT_FOUND", "Arquivo não encontrado.")

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type.endswith("javascript"):
            content_type += "; charset=utf-8"
        self._send(200, target.read_bytes(), content_type)


def main() -> int:
    if not ENV_PATH.exists():
        print("ERRO: arquivo .env não encontrado.")
        print("Copie o .env.example para .env e preencha a sua chave de API.")
        return 1

    env = load_env(ENV_PATH)
    write_env_js(env, ENV_JS_PATH)

    if not env.get("AI_API_KEY") or env.get("AI_API_KEY") == PLACEHOLDER_KEY:
        print("AVISO: AI_API_KEY não configurada no .env. A geração de cards vai falhar até você preenchê-la.")

    try:
        port = int(env.get("APP_PORT") or 8765)
    except ValueError:
        print("ERRO: APP_PORT no .env precisa ser um número.")
        return 1

    Handler.port = port
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError as exc:
        print(f"ERRO: não foi possível usar a porta {port} ({exc}). Altere APP_PORT no .env.")
        return 1

    url = f"http://localhost:{port}/"
    print(f"Youtube2Anki rodando em {url}")
    print("Pressione Ctrl+C para encerrar.")

    if env.get("APP_OPEN_BROWSER", "true").strip().lower() in ("1", "true", "yes", "sim"):
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando...")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
