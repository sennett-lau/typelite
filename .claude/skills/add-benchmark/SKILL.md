---
name: add-benchmark
description: Measure a setup (hardware, server, model) with scripts/benchmark.mjs and the fixed data, and add it as a row in a Benchmarks test page (docs/guides/benchmarks/). Use when someone wants to benchmark AI polish or speech recognition speed on their machine or share their numbers.
---

# Add a benchmark result

The format is in [CONTRIBUTING.md → Benchmarks](../../../CONTRIBUTING.md#benchmarks); each test's
method and data are on its page in `docs/guides/benchmarks/`. Read both first.

1. **Ask** (skip what the user already said): which test (polish or speech), the server's address
   and model as entered in Typelite, a key if it needs one, the hardware class, the server and its
   version and flags, the model file and quantisation, and whether it runs on this computer or
   over the network.
2. **Measure:** `node scripts/benchmark.mjs polish|speech --address <address> --model <model>`.
   For polish, make sure thinking is off first. Never invent or edit a number; if the user
   measured another way (other data), it does not belong in these tables.
3. **Add one row** to the test's **Results** table, next to rows of the same hardware, and a note
   under the table only if something was unusual. Name hardware, never the machine's name or its
   address.
4. **Check:** `npm run docs:check`. Show the diff; do not commit unless asked.
