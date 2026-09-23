# Youtube2Anki

> [!IMPORTANT]
> **Leia este documento inteiro antes de usar o projeto.** Ele explica a configuração, a execução e a importação dos baralhos no Anki.
>
> **O projeto só funciona com uma chave de API de IA.** Sem ela, nenhum flashcard é gerado. Se você ainda não tem uma chave, siga o guia **[Como obter uma chave de API do OpenRouter](#como-obter-uma-chave-de-api-do-openrouter)**: é gratuito e leva poucos minutos. Depois:
>
> 1. copie o `.env.example` para `.env`;
> 2. coloque a chave em `AI_API_KEY`;
> 3. confira se `AI_BASE_URL` é do mesmo provedor da chave.

Transforma transcrições de vídeos do YouTube (ou qualquer texto corrido) em baralhos de flashcards para o **Anki**, usando IA para sanitizar o texto, selecionar frases úteis, traduzi-las para português e escrever notas de estudo.

Cada card tem:

| Campo | Conteúdo |
|---|---|
| **Frente** | Frase original (mínimo 3 palavras), tirada diretamente da transcrição |
| **Verso** | Tradução para português do Brasil e, logo abaixo, separadas por uma linha, as **Notas**: explicação (até 250 caracteres) sobre a frase, guiada pelo foco de estudo e pelas observações |

As notas ficam dentro do próprio campo Verso, com formatação embutida, então aparecem em qualquer tipo de nota do Anki (inclusive o Basic).

## Sumário

- [Requisitos](#requisitos)
- [Configuração](#configuração)
  - [Como obter uma chave de API do OpenRouter](#como-obter-uma-chave-de-api-do-openrouter)
  - [Trocar de provedor de IA](#trocar-de-provedor-de-ia)
- [Como rodar](#como-rodar)
- [Uso](#uso)
- [Importando no Anki](#importando-no-anki)
  - [.apkg (recomendado)](#apkg-recomendado)
  - [.tsv](#tsv)
- [Estrutura](#estrutura)
- [Segurança](#segurança)
- [Problemas comuns](#problemas-comuns)

## Requisitos

- Python 3.10+
- No Ubuntu, o pacote `python3-venv`
- Uma chave de API compatível com o padrão OpenAI. O padrão do projeto é o [OpenRouter](https://openrouter.ai), que tem modelos gratuitos (veja [como obter a chave](#como-obter-uma-chave-de-api-do-openrouter)).

## Configuração

1. Copie o `.env.example` para `.env`.
2. Preencha no `.env`:
   - `AI_API_KEY`: sua chave
   - `AI_BASE_URL`: URL da API (OpenRouter, OpenAI, Gemini…)
   - `AI_MODEL`: modelo a usar (ex.: `openai/gpt-4o-mini`)
3. (Opcional) Instale as dependências manualmente. O `app.py` também as instala sozinho na primeira execução:

   ```bash
   python -m pip install -r requirements.txt
   ```

> **A chave e a URL precisam ser do mesmo provedor.** Uma chave do OpenRouter (`sk-or-...`) só funciona com `AI_BASE_URL=https://openrouter.ai/api/v1`. Uma chave da OpenAI (`sk-proj-...`) só funciona com `AI_BASE_URL=https://api.openai.com/v1`.

### Como obter uma chave de API do OpenRouter

O [OpenRouter](https://openrouter.ai) dá acesso a vários modelos (GPT, Claude, Gemini, Llama, DeepSeek…) com uma única chave. Alguns desses modelos são gratuitos.

**1. Crie uma conta**

Acesse [openrouter.ai](https://openrouter.ai), clique em **Sign In** e entre com Google, GitHub ou e-mail.

**2. Gere a chave**

1. Abra a página de chaves: [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) (ou clique na sua foto, no canto superior direito, e depois em **Keys**).
2. Clique em **Create API Key** (ou **Create Key**).
3. Dê um nome (ex.: `Youtube2Anki`). Se quiser, defina um **limite de crédito** para a chave. É uma boa proteção caso ela vaze.
4. Clique em **Create** e **copie a chave na hora**. Ela começa com `sk-or-v1-...` e **só é exibida uma vez**. Se perder, apague-a e gere outra.

**3. Escolha um modelo**

Na [lista de modelos](https://openrouter.ai/models), copie o identificador do modelo desejado (ex.: `openai/gpt-4o-mini`).

- **Modelos gratuitos** terminam em `:free` (ex.: `openai/gpt-oss-20b:free`). Para encontrá-los, filtre a lista por preço **Free** ou [busque por "free"](https://openrouter.ai/models?q=free).
- **Modelos pagos** cobram por uso e exigem créditos. Para comprar, vá em [openrouter.ai/settings/credits](https://openrouter.ai/settings/credits). Modelos como o `openai/gpt-4o-mini` custam frações de centavo por baralho.

**4. Configure o `.env`**

```env
AI_API_KEY=sk-or-v1-sua-chave-aqui
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-oss-20b:free
```

Depois, reinicie o `app.py`.

**Limites dos modelos gratuitos**

| Situação da conta | Requisições por minuto | Requisições por dia |
|---|---|---|
| Nunca comprou créditos | 20 | 50 |
| Já comprou pelo menos US$ 10 em créditos (no total) | 20 | 1.000 |

Cada baralho gerado usa 1 requisição (2 se a IA devolver um JSON inválido e o app tentar de novo). Os limites podem mudar; confira em [openrouter.ai/docs/api-reference/limits](https://openrouter.ai/docs/api-reference/limits).

**Dicas para modelos gratuitos**

- Alguns modelos gratuitos só funcionam se você permitir que o provedor use seus prompts. Se aparecer o erro *"No endpoints found matching your data policy"*, ajuste isso em [openrouter.ai/settings/privacy](https://openrouter.ai/settings/privacy).
- Modelos gratuitos podem ser mais lentos, ficar indisponíveis em horários de pico ou errar o formato JSON com mais frequência. Se isso acontecer, tente outro modelo `:free` ou um pago e barato.

### Trocar de provedor de IA

Qualquer API no padrão OpenAI `/chat/completions` funciona, bastando mudar o `.env`:

| Provedor | `AI_BASE_URL` | `AI_MODEL` (exemplo) | Onde gerar a chave |
|---|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` | [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

Depois de alterar o `.env`, **reinicie o `app.py`**: ele regenera o `env.js` que a página usa.

## Como rodar

### Ubuntu e outras distribuições Linux

Para usar diretamente da pasta do projeto:

```bash
chmod +x iniciar.sh
./iniciar.sh
```

O iniciador cria um ambiente virtual em `.venv` e instala as dependências nele. Isso evita alterar o Python do sistema e funciona nas versões recentes do Ubuntu, que bloqueiam instalações globais via `pip`.

Na primeira execução, o arquivo `.env` é criado automaticamente. Preencha `AI_API_KEY` e execute `./iniciar.sh` novamente.

Para instalar no menu de aplicativos, sem `sudo`:

```bash
chmod +x instalar-linux.sh
./instalar-linux.sh
```

Depois, abra **Youtube2Anki** no menu de aplicativos ou execute `youtube2anki` no terminal. A instalação fica em `~/.local/share/youtube2anki`. Para remover:

```bash
~/.local/share/youtube2anki/desinstalar-linux.sh
```

Se a criação do ambiente virtual falhar no Ubuntu, instale o pacote correspondente:

```bash
sudo apt update
sudo apt install python3 python3-venv
```

### Windows

```bash
python app.py
```

Ou dê dois cliques em **`iniciar.bat`** (Windows). O navegador abre sozinho em `http://localhost:8765`.

> O servidor Python é necessário para buscar transcrições do YouTube (o navegador não consegue acessar o YouTube diretamente por causa do CORS) e para gerar o `.apkg`.
> Com o `app.py` rodando pelo menos uma vez (para gerar o `env.js`), o modo **texto** com exportação **.tsv** também funciona abrindo o `index.html` direto do disco.

## Uso

1. Escolha **Link do YouTube** ou **Texto / transcrição**.
2. **YouTube:** cole o link. As legendas disponíveis são buscadas automaticamente.
   - Com vários idiomas, escolha um.
   - Com um único idioma, o campo fica travado nele.
   - Se o vídeo não tiver transcrição, aparece uma mensagem de erro.
3. Informe o **tema** (obrigatório) e, se quiser, o **foco de estudo**, a **quantidade de cards** (se ficar em branco, são gerados pelo menos 25) e as **observações** (até 250 caracteres).
4. Clique em **Gerar flashcards**, revise os cards (dá para remover os que não quiser) e baixe o arquivo.

Cards marcados como **verificar** são frases que a IA devolveu sem que elas aparecessem literalmente na transcrição. Geralmente é só uma correção de pontuação ou de erro de legenda, mas vale conferir.

## Importando no Anki

### .apkg (recomendado)

Dê dois cliques no arquivo ou use **Arquivo → Importar**. Ele cria:

- um baralho com o nome do tema;
- um tipo de nota **Youtube2Anki Basic** com os campos Front e Back.

Importar de novo um baralho com o mesmo tema atualiza os cards existentes em vez de duplicá-los.

### .tsv

1. Use **Arquivo → Importar** (Anki 2.1.55+).
2. Escolha o tipo de nota **Basic** (ou "Básico").
3. Confira o mapeamento: **Campo 1 → Frente** e **Campo 2 → Verso**.
4. Deixe marcada a opção **Permitir HTML nos campos**, para as notas aparecerem formatadas.

O arquivo já informa o separador, o uso de HTML e o baralho, que recebe o nome do tema. As colunas são mapeadas por posição, então funciona com o Anki em qualquer idioma.

## Estrutura

```
index.html            página principal
static/               CSS e JavaScript da interface
  prompt.js           instruções enviadas à IA (baseadas nas skills get-yt-transcription e transcript-to-flashcards)
  ai.js               chamada à API de IA
  cards.js            validação dos cards e exportação TSV
  app.js              lógica da interface
app.py                servidor local (página + API de transcrição + .apkg)
iniciar.sh            iniciador Linux com ambiente virtual isolado
instalar-linux.sh     instalação no perfil do usuário e atalho no menu
desinstalar-linux.sh  remoção da instalação Linux
server/
  transcript.py       youtube-transcript-api
  anki_export.py      geração do .apkg (genanki)
  config.py           leitura do .env e geração do env.js
.env.example          modelo de configuração (vai para o git)
.env / env.js         configuração real (NÃO vão para o git)
```

## Testes

Depois de preparar o ambiente Linux, execute:

```bash
./iniciar.sh --prepare-only
.venv/bin/python -m unittest discover -s tests -v
```

## Segurança

- O `.env` e o `env.js` estão no `.gitignore`. Nunca faça commit deles.
- A chave de API é repassada ao navegador pelo `env.js` para que a página chame a IA diretamente. Por isso o servidor escuta apenas em `127.0.0.1`, recusa requisições de outros hosts e não entrega o `env.js` a outros sites.
- No OpenRouter, defina um limite de crédito para a chave. Assim, se ela vazar, o prejuízo fica limitado.

## Problemas comuns

| Mensagem | Causa / solução |
|---|---|
| "Este vídeo não possui transcrição" | O vídeo não tem legendas (nem automáticas). Use o modo texto. |
| "O YouTube bloqueou a requisição" | Muitas requisições ou IP bloqueado (comum em VPNs e servidores na nuvem). Aguarde e tente de novo. |
| "A chave parece ser da OpenAI, mas AI_BASE_URL aponta para o OpenRouter" (ou o contrário) | A chave e a URL são de provedores diferentes. Veja a [tabela de provedores](#trocar-de-provedor-de-ia). |
| "Chave de API inválida" | Confira o `AI_API_KEY` e reinicie o `app.py`. |
| "Sem créditos na conta da API" | Compre créditos ou use um modelo `:free` no OpenRouter. |
| "Limite de requisições atingido" | Limite do modelo gratuito atingido (veja os [limites](#como-obter-uma-chave-de-api-do-openrouter)). Aguarde ou troque de modelo. |
| "No endpoints found matching your data policy" | Ajuste a privacidade em [openrouter.ai/settings/privacy](https://openrouter.ai/settings/privacy). |
| "A IA não retornou um JSON válido" | Alguns modelos gratuitos têm dificuldade com JSON. Tente outro `AI_MODEL`. |
| "resposta cortada por limite de tokens" | Aumente o `AI_MAX_TOKENS` ou peça menos cards. |
| Notas ou verso no campo errado ao importar o `.tsv` | Confira o mapeamento no diálogo de importação: Campo 1 → Frente, Campo 2 → Verso. |
