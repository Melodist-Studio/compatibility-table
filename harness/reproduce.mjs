// Check the published results against a fresh measurement, using only what is
// public: the public files, the open-source readers, and each file's published
// reference answers.
//
//   node harness/reproduce.mjs
//
// The published table is produced where the private files are, with readers
// that may not be public either — so this can't regenerate it. What it can do
// is re-run every open-source reader on every public file and require the
// verdict the results record, judged against the same (hashed) reference
// answers. If those cells can't be reproduced from here, they shouldn't be
// published.

import { readFileSync } from "node:fs"
import { ADAPTERS } from "./adapters/index.mjs"
import { verdictFor, RESULTS } from "./judge.mjs"
import { measureAll, publicFiles } from "./measure.mjs"

const published = JSON.parse(readFileSync(RESULTS, "utf8"))
const { tools, measured } = await measureAll(publicFiles(), ADAPTERS)

const problems = []
for (const tool of tools) {
	const recorded = published.tools.find(t => t.id === tool.id)
	if (!recorded) problems.push(`${tool.name} is not in the published results`)
	else if (recorded.version !== tool.version) {
		problems.push(`${tool.name}: measuring ${tool.version}, results record ${recorded.version}`)
	}
}

for (const file of measured) {
	const entry = published.files.find(f => f.id === file.id)
	if (!entry) {
		problems.push(`${file.id}: not in the published results`)
		continue
	}
	for (const tool of tools) {
		const fresh = verdictFor(file.results[tool.id], entry.references)
		const recorded = entry.verdicts[tool.id]
		if (JSON.stringify(fresh) !== JSON.stringify(recorded)) {
			problems.push(`${file.id} · ${tool.name}: measured ${JSON.stringify(fresh)}, published ${JSON.stringify(recorded)}`)
		}
	}
}

if (problems.length) {
	console.error(`The published results don't reproduce:\n  ${problems.join("\n  ")}`)
	process.exit(1)
}
console.log(`reproduced ${measured.length} public files × ${tools.map(t => t.name).join(", ")}`)
