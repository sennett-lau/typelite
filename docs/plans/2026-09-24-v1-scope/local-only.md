# Local only

Typelite has no accounts, paid plans or cloud services. Back to [index](index.md).

- No sign-in, account page, upgrade page, checkout, subscription or usage limits.
- No deep-link scheme.
- The only network traffic goes to the speech and AI endpoints the user configured.
- Check: while dictating, `lsof -i -n -P -p $(pgrep -x typelite)` shows connections only to
  those endpoints.
