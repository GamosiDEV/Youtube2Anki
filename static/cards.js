// Validação dos cards retornados pela IA e exportação em TSV.

const MIN_WORDS = 3;
const MAX_NOTES_CHARS = 250;
const MAX_CARDS = 100;

const cleanField = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function countWords(text) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    // Funciona também para idiomas sem espaços entre palavras (japonês, chinês...).
    let n = 0;
    for (const seg of new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)) {
      if (seg.isWordLike) n++;
    }
    return n;
  }
  return text.split(/\s+/).filter(Boolean).length;
}

// Remove pontuação, espaços e caixa para comparar a frase com a transcrição,
// já que a IA pode ter corrigido pontuação na etapa de sanitização.
const looseNormalize = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function truncateNotes(text) {
  if (text.length <= MAX_NOTES_CHARS) return text;
  const cut = text.slice(0, MAX_NOTES_CHARS - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > MAX_NOTES_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

function validateCards(rawCards, transcript, requestedCount) {
  const report = { empty: 0, short: 0, duplicate: 0, extra: 0, truncatedNotes: 0 };
  const normalizedTranscript = looseNormalize(transcript);
  const seen = new Set();
  const cards = [];

  for (const raw of rawCards) {
    if (!raw || typeof raw !== "object") { report.empty++; continue; }
    const front = cleanField(raw.front ?? raw.Front ?? raw.frente);
    const back = cleanField(raw.back ?? raw.Back ?? raw.verso);
    let notes = cleanField(raw.notes ?? raw.Notes ?? raw.notas);

    if (!front || !back) { report.empty++; continue; }
    if (countWords(front) < MIN_WORDS) { report.short++; continue; }

    const key = front.toLowerCase();
    if (seen.has(key)) { report.duplicate++; continue; }
    seen.add(key);

    if (notes.length > MAX_NOTES_CHARS) { notes = truncateNotes(notes); report.truncatedNotes++; }

    cards.push({ front, back, notes, literal: normalizedTranscript.includes(looseNormalize(front)) });
  }

  const limit = Math.min(requestedCount || MAX_CARDS, MAX_CARDS);
  if (cards.length > limit) {
    report.extra = cards.length - limit;
    cards.length = limit;
  }
  return { cards, report };
}

// ---------- Exportação ----------

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function slugify(text) {
  const slug = text
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "baralho";
}

// Estilo inline para funcionar em qualquer tipo de nota (inclusive o Basic),
// sem depender do CSS do modelo. Manter igual ao NOTES_BLOCK de server/anki_export.py.
const NOTES_STYLE =
  "margin:14px auto 0;max-width:560px;text-align:left;font-size:0.8em;line-height:1.45;" +
  "opacity:0.85;border-left:3px solid #7c8cf8;padding:6px 10px";

// Verso = tradução + bloco de notas separado por uma linha.
function composeBack(back, notes) {
  const translation = escapeHtml(cleanField(back));
  const note = escapeHtml(cleanField(notes));
  if (!note) return translation;
  // Aspas simples no atributo: aspas duplas confundem o leitor de TSV do Anki.
  return `${translation}<hr><div style='${NOTES_STYLE}'><b>Notas:</b> ${note}</div>`;
}

function buildTsv(deckName, cards) {
  // Cabeçalhos reconhecidos pelo Anki 2.1.55+ na importação de texto.
  // Sem "#columns": com ele o Anki mapeia por nome, e os campos do Basic têm
  // nomes diferentes conforme o idioma (Front/Back, Frente/Verso). Sem ele o
  // mapeamento é por posição: coluna 1 -> 1º campo, coluna 2 -> 2º campo.
  const deck = cleanField(deckName).replace(/[\t#]/g, " ") || "Youtube2Anki";
  const lines = [
    "#separator:tab",
    "#html:true",
    `#deck:${deck}`,
  ];
  for (const c of cards) {
    lines.push(`${escapeHtml(cleanField(c.front))}\t${composeBack(c.back, c.notes)}`);
  }
  return lines.join("\n") + "\n";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
