// Run every reader on every file, recording what each one read.
//
//   node harness/measure.mjs [--private DIR] [--adapters a.mjs,b.mjs]
//
// --private adds a directory of files that can't be published. They are
// measured exactly like the public ones but identified only by a hash-derived
// id: no name, no path, and — like every file — no content in anything that
// leaves the machine.
//
// Output is .work/readings.json, which holds note-level content and is never
// committed. judge.mjs turns it into the publishable verdicts.

import { execFile } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { availableParallelism } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { loadAdapters } from "./adapters/index.mjs"
import { CORPUS_DIR, readManifest } from "./corpus.mjs"
import { detectFormat, isGuitarProFilename, listFiles, readBytes, sha256 } from "./files.mjs"

const run = promisify(execFile)
const ROOT = path.resolve(import.meta.dirname, "..")
export const READINGS = path.join(ROOT, ".work", "readings.json")

/** A tool that takes longer than this on one file is recorded as hanging. */
const TIMEOUT_MS = 60_000

export const publicFiles = () =>
	readManifest().sources.flatMap(source =>
		source.files.map(file => ({
			id: `${source.id}/${file.path}`,
			tier: "public",
			source: {
				repo: source.repo,
				commit: source.commit,
				path: file.path,
				url: `https://github.com/${source.repo}/blob/${source.commit}/${encodeURI(file.path)}`,
				licence: source.licence,
			},
			sha256: file.sha256,
			file: path.join(CORPUS_DIR, source.id, file.path),
		})),
	)

/**
 * Files in `dir` that aren't already public. A private copy of a public file is
 * the same bytes, so it's measured once, as public: it can be cited.
 */
const privateFiles = (dir, publicHashes) =>
	listFiles(dir)
		.filter(isGuitarProFilename)
		.map(file => {
			const hash = sha256(readBytes(file))
			return { id: `private/${hash.slice(0, 12)}`, tier: "private", sha256: hash, file }
		})
		.filter(entry => !publicHashes.has(entry.sha256))

/**
 * One tool on one file. Only the outcome and the reading are kept: a tool's
 * error output can quote the file it choked on, so it is never recorded.
 */
const measure = async (adapter, file, format) => {
	if (!adapter.formats.includes(format)) return { outcome: "unsupported" }
	const [executable, args] = adapter.command(file)
	try {
		const { stdout } = await run(executable, args, {
			timeout: TIMEOUT_MS,
			maxBuffer: 256 * 1024 * 1024,
			cwd: ROOT,
		})
		const reading = JSON.parse(stdout)
		return isReading(reading) ? { outcome: "read", reading } : { outcome: "invalid-output" }
	} catch (error) {
		if (error.killed) return { outcome: "timeout" }
		if (error instanceof SyntaxError) return { outcome: "invalid-output" }
		return { outcome: "error" }
	}
}

const isReading = r =>
	r !== null &&
	Number.isFinite(r.measures) &&
	Number.isFinite(r.tempo) &&
	Array.isArray(r.tracks) &&
	r.tracks.every(t => Number.isFinite(t.notes) && Array.isArray(t.pitches))

/** Run `tasks` with at most `limit` in flight. */
const pool = async (tasks, limit) => {
	const results = new Array(tasks.length)
	let next = 0
	const worker = async () => {
		while (next < tasks.length) {
			const index = next++
			results[index] = await tasks[index]()
		}
	}
	await Promise.all(Array.from({ length: limit }, worker))
	return results
}

/** Every adapter on every file, as tools (with versions) and measured files. */
export const measureAll = async (files, adapters) => {
	const tools = adapters.map(({ id, name, homepage, formats, version }) => ({
		id,
		name,
		homepage,
		formats,
		version: version(),
	}))
	const measured = await pool(
		files.map(entry => async () => {
			const format = detectFormat(readBytes(entry.file))
			const results = {}
			for (const adapter of adapters) results[adapter.id] = await measure(adapter, entry.file, format)
			const { file, ...rest } = entry
			return { ...rest, format, results }
		}),
		availableParallelism(),
	)
	return { tools, measured }
}

const main = async () => {
	const argv = process.argv
	const adapters = await loadAdapters(argv)
	const privateFlag = argv.indexOf("--private")
	const open = publicFiles()
	const hidden = privateFlag >= 0 ? privateFiles(argv[privateFlag + 1], new Set(open.map(f => f.sha256))) : []
	const files = [...open, ...hidden]
	const { tools, measured } = await measureAll(files, adapters)

	mkdirSync(path.dirname(READINGS), { recursive: true })
	writeFileSync(
		READINGS,
		JSON.stringify({ measuredAt: new Date().toISOString(), tools, files: measured }),
	)
	const counts = measured.reduce((acc, f) => ({ ...acc, [f.tier]: (acc[f.tier] ?? 0) + 1 }), {})
	console.log(`measured ${JSON.stringify(counts)} files with ${tools.map(t => `${t.name} ${t.version}`).join(", ")}`)
}

if (process.argv[1] === import.meta.filename) await main()
