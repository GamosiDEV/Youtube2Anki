// Interface do Youtube2Anki.

const CONFIG = window.APP_CONFIG || null;
const IS_FILE = location.protocol === "file:";
// Aberto via file://, as chamadas ao Python vão direto para o servidor local.
const SERVER = IS_FILE ? `http://localhost:${(CONFIG && CONFIG.APP_PORT) || 8765}` : "";
const YT_URL_RE = /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com\/(watch\?|shorts\/|embed\/|live\/)|youtu\.be\/)\S+/i;

const $ = (id) => document.getElementById(id);

const state = {
  mode: null,            // "youtube" | "text"
  languagesUrl: null,    // URL para a qual os idiomas foram carregados
  languagesRequest: 0,
  video: null,           // { title, channel }
  lastInput: null,
  result: null,          // { cards, transcript, theme, language }
};

// ---------- navegação ----------

function showScreen(name) {
  for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== `screen-${name}`;
  window.scrollTo({ top: 0 });
}

function selectMode(mode) {
  state.mode = mode;
  $("source-youtube").hidden = mode !== "youtube";
  $("source-text").hidden = mode !== "text";
  hideFormError();
  showScreen("form");
  (mode === "youtube" ? $("yt-url") : $("source-textarea")).focus();
}

document.addEventListener("click", (e) => {
  const modeBtn = e.target.closest("[data-mode]");
  if (modeBtn) return selectMode(modeBtn.dataset.mode);

  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;
  e.preventDefault();
  const action = actionEl.dataset.action;
  if (action === "home") showScreen("home");
  if (action === "back-to-form") showScreen("form");
  if (action === "retry" && state.lastInput) run(state.lastInput);
});

// ---------- avisos de configuração ----------

async function serverOnline() {
  try {
    const res = await fetch(`${SERVER}/api/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkConfig() {
  const alert = $("config-alert");
  const messages = [];
  if (!CONFIG) {
    messages.push("Arquivo <code>env.js</code> não encontrado. Preencha o <code>.env</code> e rode <code>python app.py</code> (ele gera o env.js automaticamente).");
  } else if (!CONFIG.AI_API_KEY || CONFIG.AI_API_KEY === "coloque-sua-chave-aqui") {
    messages.push("A chave <code>AI_API_KEY</code> não está configurada no <code>.env</code>. Preencha-a e reinicie o <code>python app.py</code>.");
  }
  if (IS_FILE && !(await serverOnline())) {
    messages.push(`O servidor Python não está rodando em <code>${SERVER}</code>. O modo YouTube e a exportação .apkg precisam dele: rode <code>python app.py</code>.`);
  }
  alert.innerHTML = messages.join("<br>");
  alert.hidden = messages.length === 0;
}

// ---------- API do servidor Python ----------

async function apiGet(path, params) {
  const qs = new URLSearchParams(params).toString();
  let res;
  try {
    res = await fetch(`${SERVER}${path}?${qs}`, { cache: "no-store" });
  } catch {
    throw new Error("Não foi possível falar com o servidor Python. Verifique se o app.py está rodando.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) throw new Error(data?.message || `Erro ${res.status} no servidor.`);
  return data;
}

// ---------- idiomas do YouTube ----------

function setYtStatus(kind, text) {
  const el = $("yt-status");
  el.className = `field-status ${kind}`;
  el.textContent = text;
  el.hidden = !text;
}

function resetLanguages(placeholder = "Informe o link e busque as legendas") {
  state.languagesUrl = null;
  state.video = null;
  const select = $("yt-language");
  select.innerHTML = "";
  select.append(new Option(placeholder, ""));
  select.disabled = true;
  $("yt-video").hidden = true;
}

async function loadLanguages() {
  const url = $("yt-url").value.trim();
  if (!url) return setYtStatus("error", "Informe o link do vídeo.");
  if (!YT_URL_RE.test(url)) return setYtStatus("error", "Esse não parece ser um link de vídeo do YouTube.");
  if (url === state.languagesUrl) return;

  const requestId = ++state.languagesRequest;
  resetLanguages("Carregando…");
  setYtStatus("loading", "Buscando legendas disponíveis…");
  $("btn-languages").disabled = true;

  try {
    const data = await apiGet("/api/languages", { url });
    if (requestId !== state.languagesRequest) return;

    const select = $("yt-language");
    select.innerHTML = "";
    const langs = data.languages;
    if (langs.length > 1) select.append(new Option("Selecione o idioma…", ""));
    for (const l of langs) {
      const kind = l.is_generated ? "gerada automaticamente" : "manual";
      select.append(new Option(`${l.name} (${kind})`, l.code));
    }
    // Com um único idioma o campo fica travado nele.
    select.disabled = langs.length === 1;
    if (langs.length === 1) select.value = langs[0].code;

    state.languagesUrl = url;
    state.video = { title: data.title, channel: data.channel };
    setYtStatus("ok", langs.length === 1 ? "Apenas um idioma de transcrição disponível." : `${langs.length} idiomas de transcrição disponíveis. Escolha um.`);

    if (data.title) {
      const info = $("yt-video");
      info.innerHTML = "";
      const strong = document.createElement("strong");
      strong.textContent = data.title;
      info.append("Vídeo: ", strong, data.channel ? ` — ${data.channel}` : "");
      info.hidden = false;
    }
  } catch (err) {
    if (requestId !== state.languagesRequest) return;
    resetLanguages("Nenhuma transcrição disponível");
    setYtStatus("error", err.message);
  } finally {
    if (requestId === state.languagesRequest) $("btn-languages").disabled = false;
  }
}

let urlDebounce;
$("yt-url").addEventListener("input", () => {
  clearTimeout(urlDebounce);
  const url = $("yt-url").value.trim();
  if (url !== state.languagesUrl) {
    state.languagesRequest++; // descarta respostas antigas
    resetLanguages();
    setYtStatus("", "");
    $("btn-languages").disabled = false;
  }
  if (YT_URL_RE.test(url)) urlDebounce = setTimeout(loadLanguages, 700);
});
$("btn-languages").addEventListener("click", loadLanguages);

// ---------- contadores ----------

$("notes").addEventListener("input", () => ($("notes-count").textContent = $("notes").value.length));
$("source-textarea").addEventListener("input", () => ($("source-count").textContent = $("source-textarea").value.length.toLocaleString("pt-BR")));

// ---------- formulário ----------

function hideFormError() {
  $("form-error").hidden = true;
  for (const el of document.querySelectorAll(".invalid")) el.classList.remove("invalid");
}

function collectInput() {
  hideFormError();
  const errors = [];
  const invalid = (id, msg) => { $(id).classList.add("invalid"); errors.push(msg); };

  const input = {
    mode: state.mode,
    theme: $("theme").value.trim(),
    focus: $("focus").value.trim(),
    notes: $("notes").value.trim().slice(0, 250),
    count: null,
  };

  if (state.mode === "youtube") {
    input.url = $("yt-url").value.trim();
    input.lang = $("yt-language").value;
    const langOption = $("yt-language").selectedOptions[0];
    input.languageLabel = langOption ? langOption.textContent : "";
    if (!input.url) invalid("yt-url", "Informe o link do vídeo.");
    else if (state.languagesUrl !== input.url) invalid("yt-url", 'Clique em "Buscar legendas" e aguarde a lista de idiomas.');
    else if (!input.lang) invalid("yt-language", "Selecione o idioma da transcrição.");
  } else {
    input.text = $("source-textarea").value.trim();
    if (!input.text) invalid("source-textarea", "Cole o texto ou a transcrição.");
    else if (countWords(input.text) < MIN_WORDS) invalid("source-textarea", "O texto é curto demais para gerar cards.");
  }

  if (!input.theme) invalid("theme", "Informe o tema do baralho.");

  const countRaw = $("count").value.trim();
  if (countRaw) {
    const n = Number(countRaw);
    if (!Number.isInteger(n) || n < 1 || n > MAX_CARDS) invalid("count", `A quantidade de cards deve ser um número inteiro entre 1 e ${MAX_CARDS}.`);
    else input.count = n;
  }

  if (errors.length) {
    $("form-error").textContent = errors.join(" ");
    $("form-error").hidden = false;
    return null;
  }
  return input;
}

$("deck-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = collectInput();
  if (input) run(input);
});

// ---------- geração ----------

function setStep(name, status) {
  const li = document.querySelector(`#steps li[data-step="${name}"]`);
  li.className = status || "";
}

async function run(input) {
  state.lastInput = input;
  showScreen("progress");
  $("progress-error").hidden = true;
  $("progress-actions").hidden = true;
  for (const li of document.querySelectorAll("#steps li")) li.className = "";

  let current = "transcript";
  try {
    let transcript = input.text;
    let language = "";

    if (input.mode === "youtube") {
      setStep("transcript", "active");
      const data = await apiGet("/api/transcript", { url: input.url, lang: input.lang });
      transcript = data.text;
      language = `${data.language} (${data.language_code})`;
      setStep("transcript", "done");
    } else {
      setStep("transcript", "skipped");
    }

    current = "ai";
    setStep("ai", "active");
    const rawCards = await generateCards({
      transcript,
      theme: input.theme,
      focus: input.focus,
      count: input.count,
      notes: input.notes,
      language,
    });
    setStep("ai", "done");

    current = "validate";
    setStep("validate", "active");
    const { cards, report } = validateCards(rawCards, transcript, input.count);
    if (!cards.length) {
      throw new Error("A IA não encontrou frases adequadas ao tema/foco informados. Tente um tema mais amplo ou revise as observações.");
    }
    setStep("validate", "done");

    state.result = { cards, report, transcript, theme: input.theme, language, requested: input.count };
    renderResult();
    showScreen("result");
  } catch (err) {
    setStep(current, "failed");
    $("progress-error").textContent = err.message || String(err);
    $("progress-error").hidden = false;
    $("progress-actions").hidden = false;
  }
}

// ---------- resultado ----------

function renderResult() {
  const { cards, report, transcript, theme, language, requested } = state.result;

  $("result-title").textContent = theme;
  const parts = [`${cards.length} ${cards.length === 1 ? "card" : "cards"}`];
  if (requested) parts[0] += ` de ${requested} solicitados`;
  if (language) parts.push(`Idioma: ${language}`);
  $("result-summary").textContent = parts.join(" · ");

  const notes = [];
  if (report.short) notes.push(`${report.short} descartado(s) por ter menos de ${MIN_WORDS} palavras`);
  if (report.duplicate) notes.push(`${report.duplicate} duplicado(s) removido(s)`);
  if (report.empty) notes.push(`${report.empty} incompleto(s) descartado(s)`);
  if (report.extra) notes.push(`${report.extra} excedente(s) removido(s)`);
  if (report.truncatedNotes) notes.push(`${report.truncatedNotes} nota(s) encurtada(s) para 250 caracteres`);
  if (cards.some((c) => !c.literal)) notes.push('cards marcados com "verificar" não foram encontrados literalmente na transcrição (a IA pode ter corrigido algo)');
  $("result-alert").textContent = notes.length ? `Observações: ${notes.join("; ")}.` : "";
  $("result-alert").hidden = !notes.length;
  $("download-error").hidden = true;

  const tbody = $("cards-body");
  tbody.innerHTML = "";
  cards.forEach((card, i) => {
    const tr = document.createElement("tr");
    const cell = (text, cls) => {
      const td = document.createElement("td");
      if (cls) td.className = cls;
      td.textContent = text;
      tr.append(td);
      return td;
    };
    cell(String(i + 1));
    const front = cell(card.front, "front");
    if (!card.literal) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "verificar";
      badge.title = "Frase não encontrada literalmente na transcrição.";
      front.append(document.createElement("br"), badge);
    }
    cell(card.back);
    cell(card.notes, "notes");
    const actions = cell("");
    const btn = document.createElement("button");
    btn.className = "btn-remove";
    btn.title = "Remover card";
    btn.setAttribute("aria-label", "Remover card");
    btn.textContent = "✕";
    btn.addEventListener("click", () => {
      cards.splice(i, 1);
      renderResult();
    });
    actions.append(btn);
    tbody.append(tr);
  });

  $("transcript-preview").textContent = transcript;
  $("btn-apkg").disabled = $("btn-tsv").disabled = cards.length === 0;
}

$("btn-tsv").addEventListener("click", () => {
  const { cards, theme } = state.result;
  downloadBlob(new Blob([buildTsv(theme, cards)], { type: "text/tab-separated-values;charset=utf-8" }), `${slugify(theme)}-flashcards.tsv`);
});

$("btn-apkg").addEventListener("click", async () => {
  const { cards, theme } = state.result;
  const btn = $("btn-apkg");
  const errorBox = $("download-error");
  errorBox.hidden = true;
  btn.disabled = true;
  btn.textContent = "Gerando…";
  try {
    let res;
    try {
      res = await fetch(`${SERVER}/api/apkg`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deck_name: theme, cards: cards.map(({ front, back, notes }) => ({ front, back, notes })) }),
      });
    } catch {
      throw new Error("Não foi possível falar com o servidor Python para gerar o .apkg. Verifique se o app.py está rodando.");
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || `Erro ${res.status} ao gerar o .apkg.`);
    }
    downloadBlob(await res.blob(), `${slugify(theme)}-flashcards.apkg`);
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Baixar .apkg";
  }
});

// ---------- início ----------

checkConfig();
showScreen("home");
