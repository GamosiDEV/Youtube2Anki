"""Busca de transcrições do YouTube via youtube-transcript-api.

Baseado na skill get-yt-transcription: nunca traduz a transcrição, prefere a
legenda manual à gerada automaticamente e não inclui timestamps.
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import urlopen

from youtube_transcript_api import (
    AgeRestricted,
    CouldNotRetrieveTranscript,
    InvalidVideoId,
    IpBlocked,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
    VideoUnavailable,
    VideoUnplayable,
    YouTubeTranscriptApi,
)

VIDEO_ID_RE = re.compile(r"[A-Za-z0-9_-]{11}")


class TranscriptError(Exception):
    """Erro esperado, com mensagem pronta para exibir ao usuário."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def extract_video_id(url: str) -> str:
    value = (url or "").strip()
    if VIDEO_ID_RE.fullmatch(value):
        return value

    parsed = urlparse(value if "://" in value else f"https://{value}")
    host = parsed.netloc.lower().split(":", 1)[0]

    if host in {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}:
        video_id = parse_qs(parsed.query).get("v", [None])[0]
        if video_id and VIDEO_ID_RE.fullmatch(video_id):
            return video_id
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and parts[0] in {"shorts", "embed", "live"}:
            if VIDEO_ID_RE.fullmatch(parts[1]):
                return parts[1]

    if host == "youtu.be":
        candidate = parsed.path.strip("/").split("/")[0]
        if VIDEO_ID_RE.fullmatch(candidate):
            return candidate

    raise TranscriptError("INVALID_URL", "O link informado não é um link de vídeo do YouTube válido.")


def _translate_error(exc: Exception) -> TranscriptError:
    # A ordem importa: IpBlocked herda de RequestBlocked, e todas herdam de
    # CouldNotRetrieveTranscript.
    if isinstance(exc, (TranscriptsDisabled, NoTranscriptFound)):
        return TranscriptError("NO_TRANSCRIPT", "Este vídeo não possui transcrição (legenda) disponível.", 404)
    if isinstance(exc, (VideoUnavailable, InvalidVideoId)):
        return TranscriptError("VIDEO_UNAVAILABLE", "O vídeo não existe, é privado ou está indisponível.", 404)
    if isinstance(exc, AgeRestricted):
        return TranscriptError("AGE_RESTRICTED", "O vídeo tem restrição de idade e a transcrição não pode ser acessada.", 403)
    if isinstance(exc, VideoUnplayable):
        return TranscriptError("VIDEO_UNPLAYABLE", "O vídeo não pode ser reproduzido na sua região ou está bloqueado.", 403)
    if isinstance(exc, (IpBlocked, RequestBlocked)):
        return TranscriptError(
            "REQUEST_BLOCKED",
            "O YouTube bloqueou a requisição (limite de acessos ou IP bloqueado). Tente novamente mais tarde.",
            429,
        )
    if isinstance(exc, CouldNotRetrieveTranscript):
        return TranscriptError("TRANSCRIPT_FAILED", "Não foi possível obter a transcrição deste vídeo.", 502)
    return TranscriptError("UNEXPECTED_ERROR", f"Erro inesperado ao acessar o YouTube: {exc}", 500)


def _list(video_id: str) -> list[Any]:
    try:
        return list(YouTubeTranscriptApi().list(video_id))
    except Exception as exc:
        raise _translate_error(exc) from exc


def _video_metadata(video_id: str) -> dict[str, str | None]:
    """Título e canal via oEmbed. Falhas são ignoradas (metadado opcional)."""
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        with urlopen(f"https://www.youtube.com/oembed?format=json&url={quote(watch_url, safe='')}", timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return {"title": data.get("title"), "channel": data.get("author_name")}
    except Exception:
        return {"title": None, "channel": None}


def list_languages(url: str) -> dict[str, Any]:
    """Lista os idiomas de transcrição disponíveis (um por idioma, manual preferida)."""
    video_id = extract_video_id(url)
    transcripts = _list(video_id)

    by_code: dict[str, Any] = {}
    for t in transcripts:
        code = t.language_code
        # Mantém a manual quando existem manual e automática no mesmo idioma.
        if code not in by_code or (by_code[code].is_generated and not t.is_generated):
            by_code[code] = t

    if not by_code:
        raise TranscriptError("NO_TRANSCRIPT", "Este vídeo não possui transcrição (legenda) disponível.", 404)

    # Manuais primeiro; depois ordem alfabética do nome do idioma.
    ordered = sorted(by_code.values(), key=lambda t: (t.is_generated, t.language.lower()))
    return {
        "video_id": video_id,
        **_video_metadata(video_id),
        "languages": [
            {"code": t.language_code, "name": t.language, "is_generated": bool(t.is_generated)}
            for t in ordered
        ],
    }


def _join_snippets(fetched: Any) -> str:
    parts = [str(s.text).strip() for s in fetched if getattr(s, "text", None)]
    text = " ".join(p for p in parts if p)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"([(\[{])\s+", r"\1", text)
    text = re.sub(r"\s+([)\]}])", r"\1", text)
    return text.strip()


def fetch_transcript(url: str, language_code: str) -> dict[str, Any]:
    video_id = extract_video_id(url)
    if not language_code:
        raise TranscriptError("LANGUAGE_REQUIRED", "Selecione o idioma da transcrição.")

    matches = [t for t in _list(video_id) if t.language_code.lower() == language_code.strip().lower()]
    if not matches:
        raise TranscriptError("LANGUAGE_NOT_AVAILABLE", f"Não há transcrição no idioma '{language_code}' para este vídeo.", 404)

    manual = [t for t in matches if not t.is_generated]
    selected = manual[0] if manual else matches[0]

    try:
        fetched = selected.fetch()
    except Exception as exc:
        raise _translate_error(exc) from exc

    text = _join_snippets(fetched)
    if not text:
        raise TranscriptError("EMPTY_TRANSCRIPT", "A transcrição retornada pelo YouTube está vazia.", 404)

    return {
        "video_id": video_id,
        "language": selected.language,
        "language_code": selected.language_code,
        "is_generated": bool(selected.is_generated),
        "text": text,
    }
