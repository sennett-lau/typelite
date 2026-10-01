# Web search for Ask

Ask anything answers most questions from the AI model alone. Questions about news, scores,
schedules, prices or anything recent need the web. With a search server set up, Ask searches
for such a question, answers from the top results and shows the pages it used as numbered links.

Web search is **off** until you set it up. Typelite uses
[SearXNG](https://github.com/searxng/searxng), a free, open-source search engine that asks
several search engines at once. There are two ways to get one:

- **Built-in (recommended):** Settings → Search → Built-in → **Set up**. Typelite downloads
  SearXNG with its own copy of Python (about 230 MB, from GitHub) and runs it on this Mac only,
  while Typelite is open. Nothing else to install. **Check for updates** brings SearXNG up to
  date; **Remove** deletes it.
- **Your own SearXNG:** run it yourself (below), for example to share one server between
  computers, and enter its address.

When Ask needs live information, your question goes to SearXNG, which passes it on to the search
engines it uses. Other questions never leave your AI service.

The rest of this guide is for **Your own SearXNG**.

| | |
|---|---|
| Provider | [SearXNG](https://github.com/searxng/searxng), free and open source, self-hosted |
| Runs | On your computer or network |
| Cost | Free |
| API key | No |
| Address (example) | `http://127.0.0.1:8888` |

## Run SearXNG

SearXNG is a metasearch engine: it asks several search engines at once and returns their
results. Typelite reads its JSON answer, which is off in SearXNG's default settings, so you give
it a small settings file.

### 1. Write the settings file

Save this as `~/searxng/settings.yml`:

```yaml
use_default_settings: true
server:
  # Any long random string; make one with: openssl rand -hex 32
  secret_key: "change-me-to-a-long-random-string"
  limiter: false
search:
  # Typelite needs json; the default is html only.
  formats: [html, json]
```

### 2. Start it with Docker

```sh
docker run -d --name searxng --restart unless-stopped \
  -p 127.0.0.1:8888:8080 \
  -v ~/searxng:/etc/searxng \
  searxng/searxng:latest
```

`-p 127.0.0.1:8888:8080` makes it reachable from this computer only. After you change
`settings.yml`, restart it with `docker restart searxng`.

### 3. Check it

```sh
curl 'http://127.0.0.1:8888/search?q=weather&format=json' | head -c 300
```

You should see JSON that starts with `{"query": "weather"`. An HTML page that says
`403 Forbidden` means JSON is still off (see [Troubleshooting](#troubleshooting)).

### Other ways to run it

- **Without Docker:** SearXNG installs from its repository with Python; see the
  [SearXNG installation docs](https://docs.searxng.org/admin/installation.html).
- **For several computers:** publish the port on your network or a VPN such as Tailscale, and
  use that computer's address. Do not open it to the internet: with the limiter off, anyone who
  reaches it can use it.

## Set it up in Typelite

1. Open **Settings → Search** (or the **Web search** step during setup, which you can skip).
2. Choose **Your own SearXNG**, enter the address (`http://127.0.0.1:8888`) and press **Test**. Test
   searches one fixed word, never your own words, and shows how many results came back.
3. Press **Save**.

The **Key** field is optional. SearXNG needs none; a SearXNG behind a proxy that wants a token
gets it as `Authorization: Bearer <key>`. The key is kept in the macOS Keychain. **Remove key**
deletes it, and **Turn off web search** removes the address and the key.

## How Ask uses it

- Ask first decides whether a question needs live information. Only then does it search.
- While it searches, the pill says **Searching the web…**, then **Thinking** while the AI writes
  the answer.
- It searches SearXNG's general and news categories at the same time and keeps five results
  (news first only for news questions), waiting at most 4 seconds. For upcoming events, it
  looks for future dates across the returned results before choosing the five snippets.
- The results go to your AI polish service with the instruction to answer only from them and to
  cite them as `[1]`, `[2]`. **N sources** under the answer opens a column beside it with a card
  per page (site, title and a short snippet). Hover a card for **Open**, which opens the page in
  your browser, and **Copy link**. A citation in the answer opens the column on its page.
- For “next event” questions, the AI copies event names and dates from the snippets. Typelite
  checks that both appear together in the source, rejects past or unreadable dates, and shows
  the earliest supported event in the source’s original wording. It preserves date ranges and
  does not infer a race day, weekday or local time. If the snippets cannot support an answer,
  Ask says that it did not find enough information. Search snippets can still be incomplete or
  outdated; the source links let you check the full schedule.
- Search results are text from web pages. Typelite gives them to the AI marked as untrusted data,
  not instructions.
- The log records how many results came back and how long each step took, never the question or
  the results.

## Troubleshooting

| What you see | Why | What to do |
|---|---|---|
| Test: "The server refused JSON" (HTTP 403) | JSON output is off in SearXNG. | Add `json` to `search.formats` in `settings.yml` and run `docker restart searxng`. |
| Test: "Could not reach the server" | SearXNG is not running, or the address or port is wrong. | Check `docker ps` and the address. |
| Answers get worse, or SearXNG's log shows `CAPTCHA` or `suspended` | A search engine is blocking SearXNG for a while. | Nothing to do: SearXNG keeps using the other engines. If it lasts, turn that engine off in SearXNG's preferences. |
| Ask: "not enough information to answer" | The search returned no results, or the snippets could not support an answer. | Ask again with more detail, or press **Answer anyway**. |
| An answer mixes up details | Small AI models make mistakes with search results too. | Open the source links to check, or use a larger AI polish model. |
