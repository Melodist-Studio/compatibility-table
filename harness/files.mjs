// File-level helpers: hashing, finding Guitar Pro files, and telling the
// versions apart.

import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { unzipSync, strFromU8 } from "fflate"

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex")

const EXTENSIONS = new Set([".gp3", ".gp4", ".gp5", ".gpx", ".gp", ".gp7", ".gp8"])

export const isGuitarProFilename = name => EXTENSIONS.has(path.extname(name).toLowerCase())

export const listFiles = dir =>
	readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) return entry.name === ".git" ? [] : listFiles(full)
		return [full]
	})

/**
 * The Guitar Pro version a file actually is, read from its bytes.
 *
 * Never from the extension: `.gp` covers both GP7 and GP8, and files in the
 * wild carry the wrong extension often enough that the corpus has one on
 * purpose (a GP5 file named `.gp3`). A file is filed under the version its
 * bytes say, because that is what a reader has to cope with.
 *
 * Returns one of the FORMATS ids, or "unknown".
 */
export const detectFormat = bytes => {
	const binary = binaryVersion(bytes)
	if (binary) return binary
	const magic = strFromU8(bytes.subarray(0, 4), true)
	if (magic === "BCFZ" || magic === "BCFS") return "gp6"
	if (magic === "PK\u0003\u0004") return zipVersion(bytes)
	return "unknown"
}

/** The table's rows, oldest first. */
export const FORMATS = [
	{ id: "gp3", label: "Guitar Pro 3", extension: ".gp3" },
	{ id: "gp4", label: "Guitar Pro 4", extension: ".gp4" },
	{ id: "gp5.00", label: "Guitar Pro 5.0", extension: ".gp5" },
	{ id: "gp5.10", label: "Guitar Pro 5.1+", extension: ".gp5" },
	{ id: "gp6", label: "Guitar Pro 6", extension: ".gpx" },
	{ id: "gp7", label: "Guitar Pro 7", extension: ".gp" },
	{ id: "gp8", label: "Guitar Pro 8", extension: ".gp" },
]

/**
 * GP3/4/5 open with a length-prefixed version string. GP5.0 and GP5.1 are kept
 * apart because their layouts genuinely differ — a reader can handle one and
 * not the other.
 */
const binaryVersion = bytes => {
	const length = bytes[0]
	if (!length || length > 40) return null
	const text = strFromU8(bytes.subarray(1, 1 + length), true)
	const match = /^FICHIER GUITAR PRO v(\d)\.(\d\d)/.exec(text)
	if (!match) return null
	const [, major, minor] = match
	if (major === "3") return "gp3"
	if (major === "4") return "gp4"
	if (major === "5") return minor === "00" ? "gp5.00" : "gp5.10"
	return null
}

/**
 * GP7 and GP8 share a ZIP container, and its VERSION entry says 7.0 for both.
 * What differs is the GPVersion the score itself records.
 */
const zipVersion = bytes => {
	let entries
	try {
		entries = unzipSync(bytes, { filter: file => file.name.toLowerCase() === "content/score.gpif" })
	} catch {
		return "unknown"
	}
	const score = Object.values(entries)[0]
	const major = score && /<GPVersion>\s*(\d+)/.exec(strFromU8(score))?.[1]
	if (major === "7") return "gp7"
	if (major === "8") return "gp8"
	return "unknown"
}

export const readBytes = file => new Uint8Array(readFileSync(file))
