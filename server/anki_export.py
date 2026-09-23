"""Geração do pacote .apkg com genanki."""

from __future__ import annotations

import hashlib
import html
import os
import tempfile
from typing import Any

import genanki

# IDs fixos: mantê-los estáveis faz o Anki reconhecer o mesmo tipo de nota em
# importações futuras em vez de criar duplicatas.
# (O modelo antigo de 3 campos usava 1735089121; este é o de 2 campos.)
MODEL_ID = 1735089122

# Estilo inline para funcionar em qualquer tipo de nota. Manter igual ao
# NOTES_STYLE de static/cards.js.
NOTES_STYLE = (
    "margin:14px auto 0;max-width:560px;text-align:left;font-size:0.8em;line-height:1.45;"
    "opacity:0.85;border-left:3px solid #7c8cf8;padding:6px 10px"
)

MODEL = genanki.Model(
    MODEL_ID,
    "Youtube2Anki Basic",
    fields=[{"name": "Front"}, {"name": "Back"}],
    templates=[
        {
            "name": "Card 1",
            "qfmt": '<div class="front">{{Front}}</div>',
            "afmt": '<div class="front">{{Front}}</div><hr id="answer"><div class="back">{{Back}}</div>',
        }
    ],
    css="""
.card {
  font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 22px;
  text-align: center;
  color: #1f2328;
  background: #ffffff;
  line-height: 1.45;
  padding: 12px;
}
.nightMode.card, .night_mode .card { color: #e6e6e6; background: #1e1e1e; }
.front { font-weight: 600; }
.back { margin-top: 6px; }
""",
)


def _deck_id(name: str) -> int:
    # Mesmo tema => mesmo baralho no Anki.
    digest = int(hashlib.sha1(name.encode("utf-8")).hexdigest()[:8], 16)
    return (1 << 30) + digest % (1 << 30)


def _field(value: Any) -> str:
    text = " ".join(str(value or "").split())
    return html.escape(text, quote=False)


def compose_back(back: Any, notes: Any) -> str:
    """Verso = tradução + bloco de notas separado por uma linha."""
    translation, note = _field(back), _field(notes)
    if not note:
        return translation
    return f"{translation}<hr><div style='{NOTES_STYLE}'><b>Notas:</b> {note}</div>"


def build_apkg(deck_name: str, cards: list[dict[str, Any]]) -> bytes:
    deck_name = " ".join((deck_name or "").split()) or "Youtube2Anki"
    deck = genanki.Deck(_deck_id(deck_name), deck_name)

    for card in cards:
        front = _field(card.get("front"))
        if not front or not _field(card.get("back")):
            continue
        back = compose_back(card.get("back"), card.get("notes"))
        deck.add_note(genanki.Note(model=MODEL, fields=[front, back], guid=genanki.guid_for("v2", deck_name, front)))

    if not deck.notes:
        raise ValueError("Nenhum card válido para exportar.")

    fd, path = tempfile.mkstemp(suffix=".apkg")
    os.close(fd)
    try:
        genanki.Package(deck).write_to_file(path)
        with open(path, "rb") as fh:
            return fh.read()
    finally:
        os.remove(path)
