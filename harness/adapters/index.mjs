// The readers under test.
//
// Each adapter runs its tool on one file in a separate process and prints a
// *reading* to stdout: what the tool understood the file to contain, reduced to
// facts every reader can report the same way (see reading.mjs). A separate
// process per file means one tool crashing or hanging on one file costs that
// cell and nothing else.
//
// An adapter is:
//   id        stable key used in results.json
//   name      what the table calls it
//   homepage  where to find the tool
//   formats   the versions the tool *claims* to read. Anything else is
//             "not supported", never "fails": a tool isn't failing at
//             something it never set out to do.
//   version() the exact version measured, so every result names it
//   command(file) → [executable, args] that prints the reading
//
// More adapters can be passed in from outside (`--adapters module.mjs`): that
// is how a reader whose code isn't public is measured by the same harness.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

const HERE = import.meta.dirname
const ROOT = path.resolve(HERE, "../..")

const python = () => process.env.PYTHON ?? path.join(ROOT, ".venv", "bin", "python")

export const ADAPTERS = [
	{
		id: "alphatab",
		name: "alphaTab",
		homepage: "https://www.alphatab.net",
		formats: ["gp3", "gp4", "gp5.00", "gp5.10", "gp6", "gp7", "gp8"],
		version: () =>
			JSON.parse(readFileSync(path.join(ROOT, "node_modules/@coderline/alphatab/package.json"), "utf8"))
				.version,
		command: file => [process.execPath, [path.join(HERE, "alphatab.mjs"), file]],
	},
	{
		id: "pyguitarpro",
		name: "PyGuitarPro",
		homepage: "https://github.com/Perlence/PyGuitarPro",
		// GP3–5 only, by design: it reads and writes the binary formats.
		formats: ["gp3", "gp4", "gp5.00", "gp5.10"],
		version: () =>
			execFileSync(python(), ["-c", "import importlib.metadata as m; print(m.version('pyguitarpro'))"])
				.toString()
				.trim(),
		command: file => [python(), [path.join(HERE, "pyguitarpro.py"), file]],
	},
]

/** Built-in adapters plus any passed as `--adapters a.mjs,b.mjs`. */
export const loadAdapters = async argv => {
	const flag = argv.indexOf("--adapters")
	if (flag < 0) return ADAPTERS
	const extra = await Promise.all(
		argv[flag + 1].split(",").map(async file => (await import(path.resolve(file))).default),
	)
	return [...ADAPTERS, ...extra]
}
