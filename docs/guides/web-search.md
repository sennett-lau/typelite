# Web search for Ask

Ask anything answers most questions from the AI model alone. Questions about news, scores,
schedules, prices or anything recent need the web. With a search server set up, Ask searches
for such a question, answers from the top results and shows the pages it used as links under
the answer.

Web search is off until you add your own search server. Typelite ships no search service and
never sends your question anywhere else. When Ask needs live information, your question goes to
the search server you entered, and that server passes it on to the search engines it uses.

## SearXNG

[SearXNG](https://github.com/searxng/searxng) is a free, open-source metasearch engine that you
run yourself. It asks several search engines at once and needs no API key.

Run it with Docker, on this computer only:

```sh
mkdir -p ~/searxng
cat > ~/searxng/settings.yml <<'EOF'
use_default_settings: true
server:
  secret_key: "change-me-to-a-long-random-string"
  limiter: false
search:
  formats: [html, json]
EOF
docker run -d --name searxng --restart unless-stopped \
  -p 127.0.0.1:8888:8080 -v ~/searxng:/etc/searxng searxng/searxng:latest
```

Use address `http://127.0.0.1:8888`, no key.

- **JSON must be on.** Typelite reads SearXNG's JSON answer (`/search?q=…&format=json`). The
  default settings allow only HTML, and SearXNG then answers `403 Forbidden`; Typelite's Test says
  so. The line `formats: [html, json]` above turns JSON on. Restart SearXNG after you change
  `settings.yml` (`docker restart searxng`).
- **Keep it private.** `-p 127.0.0.1:8888:8080` makes it reachable from this computer only. To use
  one SearXNG from several computers, publish the port on your network or a VPN such as Tailscale,
  and do not open it to the internet: with the limiter off, anyone who reaches it can use it.
- Replace the `secret_key` with your own random string (`openssl rand -hex 32`).
- Without Docker, SearXNG also installs from its repository with Python; see the
  [SearXNG installation docs](https://docs.searxng.org/admin/installation.html).

## Set it up in Typelite

1. Open **Settings → AI polish → Web search for Ask** (or, during setup, **Web search for Ask
   (optional)** under the AI step).
2. Choose **SearXNG**, enter the address and press **Test**. It searches one fixed word, never
   your own words, and shows how many results came back.
3. Press **Save**. The **Key** field is optional: SearXNG needs none, but a SearXNG behind a proxy
   that wants a token gets it as `Authorization: Bearer <key>`. The key is kept in the macOS
   Keychain.

To change the address, edit it and press **Save** again. **Turn off web search** removes the
address and the key.

## How Ask uses it

- Ask first decides whether a question needs live information (the same check as before). Only
  then does it search; other questions never leave your AI service.
- It searches SearXNG's general and news categories at the same time, takes the top two news
  results and then the top general ones, five in all, and waits at most 4 seconds.
- The results go to your AI polish service with the instruction to answer only from them and to
  cite them as `[1]`, `[2]`. The cited pages appear as numbered links under the answer; a click
  opens the page in your browser.
- Search results are text from web pages. Typelite gives them to the AI marked as untrusted data,
  not instructions.
- When the search fails or finds nothing, the Ask panel says so and offers **Answer anyway**,
  which answers from the model alone and notes that the answer may be out of date.
- The log records how many results came back and how long each step took, never the question or
  the results.

## Trouble

| What you see | What to do |
|---|---|
| Test: "The server refused JSON" | Add `json` to `search.formats` in `settings.yml` and restart SearXNG. |
| Test: "Could not reach the server" | Check that SearXNG runs (`docker ps`) and the address and port. |
| Ask: "the web search did not work" | The same checks. The search engines SearXNG asks can also block it for a while (a CAPTCHA); it then uses the others. |
| Answers cite the wrong page or mix up details | Small models make mistakes with search results too. Open the source links to check, or use a larger AI polish model. |
