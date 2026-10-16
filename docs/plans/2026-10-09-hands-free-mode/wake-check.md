# Wake check

How a voiced segment becomes "wake" or "not wake". Part of [hands-free-mode](index.md).

## Segments

`hands_free/segment.rs` (`WakeSegmenter`) cuts candidates out of the ring:

- from where the gate saw speech start, minus 200 ms of pre-roll (soft first consonants);
- up to the end of speech (300 ms hangover, 100 ms of it kept). If the speaker goes on, the
  segment is cut at 2 s ("Hey Sam, what's …" is checked on its first 2 s), and the rest of that
  stretch is not checked again;
- dropped when it has less than 200 ms of voiced audio (the voice check's minimum).

Continuous background talk therefore costs at most one check per stretch of speech between
pauses. It is never one check per frame.

## The Whisper check

`hands_free/wake.rs` runs whisper.cpp (already in the app through whisper-rs, Metal on macOS)
with:

- **model** Whisper base, multilingual, q5_1 (60 MB, `ggml-base-q5_1.bin`). The app downloads it
  from the official whisper.cpp repository on Hugging Face and checks it against a pinned
  SHA-256. It has its own context, separate from built-in speech. It is loaded when listening
  starts (about 0.1–0.3 s) and freed when listening stops;
- **prompt** the wake name only ("Sam."), as tokens. The text prompt API of whisper-rs leaks a
  C string per call;
- **language** English for a Latin wake name ("嘿 Sam" still comes out as "Hey Sam"), automatic
  for a name in another script;
- single segment, no timestamps, at most 12 tokens, greedy decoding with no temperature
  fallback, and a **fixed 512-frame encoder window** (10.24 s, a third of the full window);
- segments with Whisper's no-speech probability above 0.6 are ignored.

The transcript is only compared. It is never logged, stored or sent. The log line is
`Hands-free: wake phrase heard (score 1.00, check 37 ms, voiced 640 ms)`.

## Fuzzy matcher

`hands_free/matcher.rs` (`WakePhrase`) is Typelite's own code:

1. Normalise: lower case, punctuation splits words, each CJK character is a word, accents are
   removed, and a few sound-alike spellings are unified (ph→f, z→s, silent "p" in "ps", "lm"→"m"
   for "Psalm", doubled letters).
2. A greeting word must come first, after at most two filler words ("Oh, hey Sam"). Accepted
   greetings: hey, hay, hei, hej, he, hi, hai, ay, eh, a, k, kay, 嘿, 嗨, 黑, 喂, 哎, 诶, 欸.
   "He is Sam" counts too, and so does a joined word ("Heysam").
3. The name is compared with the next one to four words, joined, by a weighted edit distance in
   which swapping one vowel for another costs half. The default name also accepts Whisper's
   Chinese transliterations (山姆, 森姆 …).

| Sensitivity | Name tolerance | Extra |
| --- | --- | --- |
| Low | exact after normalising | |
| Normal (default) | 15% of the name, at least one vowel | |
| High | 25% of the name, at least one vowel | the name alone ("Sam.") when nothing else was said |

A wider High setting (one consonant in "Sam") was tried. It woke on "Hey man" and "Hey Pam" in
17 of 47 negatives, so it was narrowed (see [measurements.md](measurements.md)).

## Considered

- **The full phrase as the prompt ("Hey Sam.").** It was more robust on a bare "Hey Sam", but
  Whisper then dropped "Hey Sam" from "Hey Sam, what's …" (8/8) and heard "Hey Pam" as "Hey Sam".
- **No prompt.** It missed 4 of 27 ("Hayson", "HSM").
- **Whisper tiny (32 MB).** It missed 5 of 27 and repeated text ("Peace, Sam. Peace, Sam. …").
- **Matching anywhere in the segment.** This was rejected because a conversation about Sam
  would wake Typelite.
