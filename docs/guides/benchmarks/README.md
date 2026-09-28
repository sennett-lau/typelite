# Benchmarks

How fast AI polish and speech recognition are on real setups, so you can judge what to expect
from similar hardware. They are measurements, not a recommendation: pick the setup that fits your
privacy, cost and speed needs. How well a model handles a language is in the
[language guides](../languages/README.md#language-guides), not here.

| Test | Measures |
|---|---|
| [AI polish speed](polish-speed.md) | Seconds per polish request, for a short and a long English transcript. |
| [Speech recognition speed](speech-speed.md) | Seconds to recognise a short English clip. |

Every row is measured with the same data, in [`data/`](data/), and the same script:

```sh
node scripts/benchmark.mjs polish --address <address> --model <model> [--key <key>]
node scripts/benchmark.mjs speech --address <address> --model <model> [--key <key>]
```

The address and model are what you would enter in Typelite. Measured your setup? Add a row to the
test's table; see [Contributing → Benchmarks](../../../CONTRIBUTING.md#benchmarks).
