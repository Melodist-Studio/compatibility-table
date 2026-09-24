// Turn readings into verdicts: for every file and every reader, did it read the
// file fully, partly, not at all — or is it a format the reader never claimed?
//
//   node harness/judge.mjs
//
// There is no privileged reader. For each check (see reading.mjs) the correct
// answer is what a strict majority of the readers that opened the file agree
// on. Where there's no majority — two readers disagreeing, or one reader alone
// — nobody's word is taken for it: the check stays unverified until a person
// settles it in adjudications.json, with the reason written down. An
// adjudication also overrides a majority, for the case where most readers
// share a bug.
//
// Output is results/results.json: verdicts only, never readings, so it is safe
// to publish for private files too.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { READINGS } from "./measure.mjs"
import { sha256 } from "./files.mjs"
import { CHECKS, project } from "./reading.mjs"

const ROOT = path.resolve(import.meta.dirname, "..")
export const RESULTS = path.join(ROOT, "results", "results.json")
const ADJUDICATIONS = path.join(ROOT, "adjudications.json")

const FAILURES = new Set(["error", "timeout", "invalid-output"])

/**
 * The correct answer to `check` for one file, as a projection (see
 * reading.mjs), or null when it can't be established. `readers` are the tools
 * that opened the file.
 */
export const referenceFor = (check, readers, adjudication) => {
	const answers = Map.groupBy(readers, ({ reading }) => project(check, reading))
	if (adjudication) {
		const named = [...answers].filter(([, group]) => group.some(r => adjudication.correct.includes(r.tool)))
		if (named.length !== 1) {
			throw new Error(`adjudication ${adjudication.file}#${adjudication.check} names readers that disagree or didn't read it`)
		}
		return named[0][0]
	}
	const [answer, group] = [...answers].sort((a, b) => b[1].length - a[1].length)[0] ?? []
	// A strict majority of at least two: one reader alone confirms nothing.
	if (!group || group.length < 2 || group.length * 2 <= readers.length) return null
	return answer
}

/** A tool's verdict on one file, given the reference answer to each check. */
export const verdictFor = (result, references) => {
	if (result.outcome === "unsupported") return { verdict: "unsupported" }
	if (FAILURES.has(result.outcome)) return { verdict: "fails", reason: result.outcome }

	const wrong = CHECKS.filter(c => references[c.id] && references[c.id] !== hashAnswer(project(c, result.reading)))
	const unsettled = CHECKS.filter(c => !references[c.id])
	if (wrong.length) return { verdict: "partial", checks: wrong.map(c => c.id) }
	if (unsettled.length) return { verdict: "unverified", checks: unsettled.map(c => c.id) }
	return { verdict: "full" }
}

/**
 * References are published as hashes. For a public file that lets anyone
 * check a reader against the agreed answer without that answer — or any
 * reader's content — appearing in the results.
 */
export const hashAnswer = answer => sha256(answer)

/** One file's reference answers (hashed) and every tool's verdict. */
export const judgeFile = (file, adjudications) => {
	const readers = Object.entries(file.results)
		.filter(([, result]) => result.outcome === "read")
		.map(([tool, result]) => ({ tool, reading: result.reading }))

	const references = Object.fromEntries(
		CHECKS.map(check => {
			const answer = referenceFor(check, readers, adjudications.get(`${file.id}#${check.id}`))
			return [check.id, answer === null ? null : hashAnswer(answer)]
		}),
	)
	const verdicts = Object.fromEntries(
		Object.entries(file.results).map(([tool, result]) => [tool, verdictFor(result, references)]),
	)
	return { references, verdicts }
}

const loadAdjudications = () => {
	if (!existsSync(ADJUDICATIONS)) return new Map()
	const { adjudications } = JSON.parse(readFileSync(ADJUDICATIONS, "utf8"))
	return new Map(adjudications.map(a => [`${a.file}#${a.check}`, a]))
}

const main = () => {
	const readings = JSON.parse(readFileSync(READINGS, "utf8"))
	const adjudications = loadAdjudications()

	const files = readings.files.map(({ results, ...file }) => {
		const { references, verdicts } = judgeFile({ ...file, results }, adjudications)
		// Only public files carry their references: a hash of a private file's
		// pitches is still a fingerprint of its content.
		return file.tier === "public" ? { ...file, references, verdicts } : { ...file, verdicts }
	})

	mkdirSync(path.dirname(RESULTS), { recursive: true })
	writeFileSync(
		RESULTS,
		JSON.stringify(
			{
				schema: 1,
				measuredAt: readings.measuredAt,
				tools: readings.tools,
				checks: CHECKS.map(({ id, label }) => ({ id, label })),
				files,
			},
			null,
			"\t",
		) + "\n",
	)

	const tally = {}
	for (const file of files) {
		for (const [tool, { verdict }] of Object.entries(file.verdicts)) {
			tally[tool] = { ...tally[tool], [verdict]: (tally[tool]?.[verdict] ?? 0) + 1 }
		}
	}
	console.log(JSON.stringify(tally))
}

if (process.argv[1] === import.meta.filename) main()
