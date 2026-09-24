// alphaTab's reading of one file. Usage: node alphatab.mjs <file>
//
// alphaTab numbers strings from the lowest (string 1) and stores tuning from
// the highest, so a note's open string is tuning[length - string]. A staff with
// no strings (a keyboard part) has no tuning and no fret: its notes carry their
// pitch directly, and with nothing to fret, that pitch is the one played.

import { readFileSync } from "node:fs"

// alphaTab logs through console; stdout carries only the reading.
console.log = console.info = console.warn = () => {}
const alphaTab = await import("@coderline/alphatab")
alphaTab.Logger.logLevel = alphaTab.LogLevel.None

const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(process.argv[2])))

const readTrack = track => {
	const percussion = track.staves.some(staff => staff.isPercussion)
	const tuned = track.staves.find(staff => staff.tuning.length > 0)
	const tuning = percussion || !tuned ? null : [...tuned.tuning].reverse()
	const pitches = []
	let notes = 0
	for (const staff of track.staves) {
		for (const bar of staff.bars) {
			for (const voice of bar.voices) {
				for (const beat of voice.beats) {
					for (const note of beat.notes) {
						if (note.isTieDestination) continue
						notes += 1
						if (percussion) continue
						pitches.push(
							staff.tuning.length > 0
								? staff.tuning[staff.tuning.length - note.string] + note.fret
								: note.realValue,
						)
					}
				}
			}
		}
	}
	return { percussion, tuning, notes, pitches }
}

process.stdout.write(
	JSON.stringify({
		measures: score.masterBars.length,
		tempo: score.tempo,
		tracks: score.tracks.map(readTrack),
	}),
)
