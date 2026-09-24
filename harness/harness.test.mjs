import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { strToU8, zipSync } from "fflate"
import { detectFormat } from "./files.mjs"
import { judgeFile, referenceFor } from "./judge.mjs"
import { project } from "./reading.mjs"
import { CHECKS } from "./reading.mjs"
import { summarizeCell } from "./render.mjs"

const pascal = text => new Uint8Array([text.length, ...strToU8(text), 0, 0, 0])
const gpif = version => zipSync({ "Content/score.gpif": strToU8(`<GPIF><GPVersion>${version}</GPVersion></GPIF>`), VERSION: strToU8("7.0") })

describe("detectFormat reads the version from the bytes", () => {
	it("tells the binary versions apart, GP5.0 from GP5.1 included", () => {
		assert.equal(detectFormat(pascal("FICHIER GUITAR PRO v3.00")), "gp3")
		assert.equal(detectFormat(pascal("FICHIER GUITAR PRO v4.06")), "gp4")
		assert.equal(detectFormat(pascal("FICHIER GUITAR PRO v5.00")), "gp5.00")
		assert.equal(detectFormat(pascal("FICHIER GUITAR PRO v5.10")), "gp5.10")
	})

	it("reads GP6 from its container magic", () => {
		assert.equal(detectFormat(strToU8("BCFZ\0\0\0\0")), "gp6")
	})

	// Both write VERSION 7.0 into the container; only the score says which.
	it("tells GP7 from GP8 by the score's GPVersion, not the container's", () => {
		assert.equal(detectFormat(gpif("7.6.0")), "gp7")
		assert.equal(detectFormat(gpif("8.1.3")), "gp8")
	})

	it("calls anything else unknown rather than guessing", () => {
		assert.equal(detectFormat(strToU8("MThd\u0000\u0000\u0000\u0006")), "unknown")
		assert.equal(detectFormat(pascal("FICHIER GUITAR PRO v9.99")), "unknown")
	})
})

const reading = (overrides = {}) => ({
	measures: 4,
	tempo: 120,
	tracks: [{ percussion: false, tuning: [40, 45, 50, 55, 59, 64], notes: 3, pitches: [40, 52, 64] }],
	...overrides,
})
const read = r => ({ outcome: "read", reading: r })
const tracks = CHECKS.find(c => c.id === "tracks")

describe("referenceFor takes nobody's word alone", () => {
	const readers = (...rs) => rs.map((r, i) => ({ tool: `t${i}`, reading: r }))
	const odd = reading({ tracks: [] })

	it("accepts a strict majority", () => {
		assert.equal(referenceFor(tracks, readers(reading(), reading(), odd)), project(tracks, reading()))
	})

	it("settles nothing when two readers disagree", () => {
		assert.equal(referenceFor(tracks, readers(reading(), odd)), null)
	})

	it("settles nothing on one reader's word", () => {
		assert.equal(referenceFor(tracks, readers(reading())), null)
	})

	it("defers to an adjudication, even over a majority", () => {
		const adjudication = { correct: ["t2"] }
		assert.equal(referenceFor(tracks, readers(reading(), reading(), odd), adjudication), project(tracks, odd))
	})

	it("refuses an adjudication naming readers that disagree", () => {
		assert.throws(() => referenceFor(tracks, readers(reading(), odd), { correct: ["t0", "t1"] }))
	})
})

describe("judgeFile", () => {
	const file = results => ({ id: "f", results })
	const none = new Map()
	const judged = (results, adjudications = none) => judgeFile(file(results), adjudications).verdicts

	it("never calls a format a reader doesn't claim a failure", () => {
		const verdicts = judged({ a: read(reading()), b: { outcome: "unsupported" } })
		assert.deepEqual(verdicts.b, { verdict: "unsupported" })
	})

	it("records why a reader failed, and nothing it printed", () => {
		const verdicts = judged({ a: { outcome: "timeout" } })
		assert.deepEqual(verdicts.a, { verdict: "fails", reason: "timeout" })
	})

	it("names the checks a reader got wrong", () => {
		const wrongPitch = reading({ tracks: [{ ...reading().tracks[0], pitches: [41, 52, 64] }] })
		const verdicts = judged({ a: read(reading()), b: read(reading()), c: read(wrongPitch) })
		assert.deepEqual(verdicts.a, { verdict: "full" })
		assert.deepEqual(verdicts.c, { verdict: "partial", checks: ["pitches"] })
	})

	it("leaves a lone reader unverified", () => {
		const verdicts = judged({ a: read(reading()), b: { outcome: "unsupported" } })
		assert.equal(verdicts.a.verdict, "unverified")
	})

	it("compares pitches regardless of the order a reader stores them in", () => {
		const shuffled = reading({ tracks: [{ ...reading().tracks[0], pitches: [64, 40, 52] }] })
		const verdicts = judged({ a: read(reading()), b: read(shuffled) })
		assert.deepEqual(verdicts.b, { verdict: "full" })
	})

	// A reading of a private file is its content. Verdicts are what gets
	// published, so nothing from a reading may survive into them.
	it("carries no reading into a verdict", () => {
		const verdicts = judged({ a: read(reading()), b: read(reading()) })
		const text = JSON.stringify(verdicts)
		assert.ok(!/pitches|tuning|\b52\b/.test(text), text)
	})
})

describe("summarizeCell", () => {
	const v = (...verdicts) => verdicts.map(verdict => ({ verdict }))

	it("is Full only when every verified file is", () => {
		assert.equal(summarizeCell(v("full", "full")).level, "full")
		assert.equal(summarizeCell(v("full", "partial")).level, "partial")
	})

	it("is Fails when nothing opened", () => {
		assert.equal(summarizeCell(v("fails", "fails")).level, "fails")
	})

	it("lets unverified files decide nothing", () => {
		assert.equal(summarizeCell(v("full", "unverified")).level, "full")
		assert.match(summarizeCell(v("full", "unverified")).text, /1 unverified/)
		assert.equal(summarizeCell(v("unverified")).level, "unverified")
	})

	it("says Not supported only when the reader claims none of the files", () => {
		assert.equal(summarizeCell(v("unsupported", "unsupported")).level, "unsupported")
	})
})
