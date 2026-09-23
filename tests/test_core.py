from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from server.anki_export import build_apkg, compose_back
from server.config import load_env
from server.transcript import TranscriptError, extract_video_id


class ConfigTests(unittest.TestCase):
    def test_load_env_supports_comments_quotes_and_export(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text(
                "# comentário\nexport AI_API_KEY='abc'\nAI_MODEL=\"modelo/teste\"\n",
                encoding="utf-8",
            )

            self.assertEqual(
                load_env(path),
                {"AI_API_KEY": "abc", "AI_MODEL": "modelo/teste"},
            )


class TranscriptTests(unittest.TestCase):
    def test_extract_video_id_from_supported_urls(self) -> None:
        video_id = "dQw4w9WgXcQ"
        urls = (
            video_id,
            f"https://www.youtube.com/watch?v={video_id}",
            f"https://youtu.be/{video_id}?si=teste",
            f"https://www.youtube.com/shorts/{video_id}",
            f"https://www.youtube.com/embed/{video_id}",
        )

        for url in urls:
            with self.subTest(url=url):
                self.assertEqual(extract_video_id(url), video_id)

    def test_extract_video_id_rejects_other_hosts(self) -> None:
        with self.assertRaises(TranscriptError) as raised:
            extract_video_id("https://example.com/watch?v=dQw4w9WgXcQ")

        self.assertEqual(raised.exception.code, "INVALID_URL")


class AnkiExportTests(unittest.TestCase):
    def test_compose_back_escapes_user_content(self) -> None:
        result = compose_back("tradução <script>", "nota & detalhe")

        self.assertIn("tradução &lt;script&gt;", result)
        self.assertIn("nota &amp; detalhe", result)

    def test_build_apkg_returns_a_zip_package(self) -> None:
        package = build_apkg(
            "Teste Linux",
            [{"front": "Original sentence here", "back": "Frase original aqui", "notes": "Nota"}],
        )

        self.assertTrue(package.startswith(b"PK"))
        self.assertGreater(len(package), 100)


if __name__ == "__main__":
    unittest.main()
