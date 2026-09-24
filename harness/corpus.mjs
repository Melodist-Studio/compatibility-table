// Fetch the public corpus: Guitar Pro files other projects publish as test
// data, at the commits pinned in corpus/public.json.
//
// Nothing here is redistributed. Each file is downloaded from its own
// repository, checked against the hash recorded when it was pinned, and cited
// by that repository's URL in the results. A result therefore always names the
// exact bytes it was measured on, and anyone can fetch the same bytes.
//
//   node harness/corpus.mjs            fetch and verify every source
//   node harness/corpus.mjs --pin ID   re-record source ID's file list and
//                                      hashes (after changing its commit)

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { sha256, isGuitarProFilename, listFiles } from "./files.mjs"

const ROOT = path.resolve(import.meta.dirname, "..")
const MANIFEST = path.join(ROOT, "corpus", "public.json")
export const CORPUS_DIR = path.join(ROOT, ".corpus")

export const readManifest = () => JSON.parse(readFileSync(MANIFEST, "utf8"))

/** Check out `source` at its pinned commit, shallowly, into .corpus/<id>. */
const checkout = source => {
	const dir = path.join(CORPUS_DIR, source.id)
	const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" })
	if (!existsSync(path.join(dir, ".git"))) {
		mkdirSync(dir, { recursive: true })
		git("init", "-q")
		git("remote", "add", "origin", `https://github.com/${source.repo}.git`)
	}
	if (currentCommit(git) !== source.commit) {
		git("fetch", "-q", "--depth", "1", "origin", source.commit)
		git("checkout", "-q", "--detach", source.commit)
	}
	return dir
}

/** HEAD's commit, or null in a repository that has fetched nothing yet. */
const currentCommit = git => {
	try {
		return git("rev-parse", "HEAD").toString().trim()
	} catch {
		return null
	}
}

const verify = (source, dir) => {
	const problems = source.files.flatMap(file => {
		const full = path.join(dir, file.path)
		if (!existsSync(full)) return [`${file.path}: missing`]
		const actual = sha256(readFileSync(full))
		return actual === file.sha256 ? [] : [`${file.path}: hash ${actual} ≠ pinned ${file.sha256}`]
	})
	if (problems.length) {
		throw new Error(`${source.id} does not match its pin:\n  ${problems.join("\n  ")}`)
	}
}

/** Record every Guitar Pro file under the source's directory, with its hash. */
const pin = (source, dir) =>
	listFiles(path.join(dir, source.directory))
		.filter(isGuitarProFilename)
		.filter(full => !(source.exclude ?? []).some(prefix => path.relative(dir, full).startsWith(prefix)))
		.map(full => ({
			path: path.relative(dir, full),
			sha256: sha256(readFileSync(full)),
		}))
		.sort((a, b) => a.path.localeCompare(b.path))

const main = () => {
	const manifest = readManifest()
	const pinning = process.argv.indexOf("--pin")
	const pinId = pinning >= 0 ? process.argv[pinning + 1] : null

	for (const source of manifest.sources) {
		const dir = checkout(source)
		if (source.id === pinId) {
			source.files = pin(source, dir)
			console.log(`${source.id}: pinned ${source.files.length} files at ${source.commit}`)
		} else {
			verify(source, dir)
			console.log(`${source.id}: ${source.files.length} files verified at ${source.commit.slice(0, 7)}`)
		}
	}
	if (pinId) writeFileSync(MANIFEST, JSON.stringify(manifest, null, "\t") + "\n")
}

if (process.argv[1] === import.meta.filename) main()
