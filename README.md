# Guitar Pro compatibility

Which Guitar Pro versions each reader can actually read, measured on real
files rather than taken from feature lists.

**[→ The table](TABLE.md)** · [the data behind it](results/results.json)

A reader that opens a file hasn't necessarily read it. A misread partway
through a Guitar Pro file rarely crashes. More often the reader quietly carries
on with the wrong notes, or with half of them. So every file is read by every
tool, and the readings are compared fact by fact.

## Methodology

### Files

- **Public files:** the Guitar Pro test files of
  [slundi/guitarpro](https://github.com/slundi/guitarpro) (MIT), gathered from
  the PyGuitarPro, TuxGuitar and alphaTab test suites. They're pinned by commit
  in [`corpus/public.json`](corpus/public.json), and each is checked against a
  recorded SHA-256 before it's measured. They're downloaded from their own
  repository, never copied here, and every result links to its source.
- **Private files:** real-world files that aren't ours to publish. They're
  measured in exactly the same way, but identified only by an id derived from
  their hash, never by name. The hash is recorded, so anyone given the file
  privately can confirm it's the one that was measured.
- **Excluded:** `test/edge_cases/`, which holds deliberately malformed files.
  How a reader copes with corruption is a separate question from which versions
  it reads.

A file is filed under the version its **bytes** declare, not its extension.
`.gp` covers both GP7 and GP8, and a wrong extension is common enough in the
wild that one of the test files has one on purpose. GP5.0 and GP5.1+ are kept
apart because their layouts differ, and a reader can handle one without the
other.

### What is compared

Each reader's understanding of a file is reduced to facts that every reader
exposes the same way ([`harness/reading.mjs`](harness/reading.mjs)):

| Check | Catches |
|---|---|
| Track count, bar count | structural misreads |
| Tempo | header misreads |
| Tunings (lowest string first) | the classic reversed-string bug |
| Notes per track | dropped or invented notes |
| Pitches per pitched track | wrong notes, the thing a musician hears |

A few things are normalised, each documented in the adapter concerned:

- A note tied from the one before it isn't struck again, so it isn't counted.
- A grace note is counted as the note it is, whether a library stores it as a
  note or as an effect on the next one.
- Pitch is the fretted pitch (open string plus fret), so a harmonic is compared
  where it's played, not where it rings.
- Pitches are compared as a set per track, independent of the order a library
  stores voices in.

Not yet compared: effects (bends, slides, vibrato and so on), dynamics,
lyrics, and percussion articulations. A "Full" means full **on the checks
above**. Checks will be added over time, and each addition is dated in the
results.

### Who decides the right answer

No reader is taken as the reference, including the one this project's authors
make. For each file and each check:

1. The correct answer is what a **strict majority** of the readers that opened
   the file agree on, needing at least two.
2. If there's no majority (two readers disagreeing, or a file only one reader
   opens), the check is **unverified**, and it counts for and against nobody.
3. A person can settle an unverified check, or overrule a majority that shares
   a bug, in [`adjudications.json`](adjudications.json). Each entry names the
   readers that are right and says how that was established, usually by
   checking in Guitar Pro itself.

A majority is only as good as the independence of the readers in it, and
readers aren't fully independent. Libraries are often written with another as
a reference: Melodist's Guitar Pro parsers were checked against PyGuitarPro and
alphaTab while they were built. So when a reader is outvoted on a private file,
which its maintainers can't inspect for themselves, the verdict isn't
published until it's confirmed in Guitar Pro.

### Results

| | |
|---|---|
| ✅ **Full** | every checked file was read completely |
| ⚠️ **Partial** | some files opened but came out wrong; the table lists each one and which checks failed |
| ❌ **Fails** | files the reader claims to support didn't open, crashed, or hung (60 s limit) |
| — **Not supported** | a version the reader doesn't claim to read. This is never counted as a failure. |
| ❔ **Unverified** | nothing independent to check the reading against yet |

Every result names the exact version of each reader and the date it was
measured.

## How the table is made

Two parts, so that private files can be measured without being published:

1. **Here:** the harness, the public file list and the published results.
   [CI](.github/workflows/check.yml) re-runs every open-source reader on every
   public file and requires the published verdicts. It judges each reading
   against the published reference answers, which are stored as hashes. If a
   public cell can't be reproduced from this repository alone, the build fails.
2. **Privately:** the same harness, run over the public and private files
   together, plus readers whose code isn't public. It publishes only
   `results/results.json` and `TABLE.md` here. Readings never leave that
   machine; for a private file, its readings are its content.

## Run it yourself

```sh
npm ci
python -m venv .venv && .venv/bin/pip install -r requirements.txt
npm run corpus                   # fetch and verify the public files
node harness/reproduce.mjs       # check the published verdicts
npm run table                    # or measure, judge and render from scratch
```

## Adding a reader

Write an adapter that prints a reading for one file (see
[`harness/adapters/index.mjs`](harness/adapters/index.mjs)) and open a pull
request. A reader is only listed for the versions it claims to support.

## Corrections

If a result looks wrong, particularly for a reader you maintain, please
[open an issue](https://github.com/Melodist-Studio/compatibility-table/issues).
A misconfigured adapter is as likely a cause as a bug in the reader, and either
way we want it fixed. We can share a private file with a reader's maintainer
so they can check a result against it.

## Licences

- Code: [MIT](LICENSE).
- Results (`results/`, `TABLE.md`): [CC BY 4.0](LICENSE-RESULTS). Cite as
  “Melodist Studio, Guitar Pro compatibility”, with the measurement date.
- The test files belong to their authors, under their own licences. They're
  linked to, not redistributed.
