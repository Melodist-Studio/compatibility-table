// What a reader understood a file to contain.
//
// Every adapter reduces its tool's own model to this shape, so readings from
// different tools can be compared fact by fact:
//
//   {
//     "measures": 32,            bars in the piece
//     "tempo": 120,              the opening tempo, in beats per minute
//     "tracks": [
//       {
//         "percussion": false,
//         "tuning": [40, 45, …],  open-string MIDI pitches, lowest string
//                                 first; null for percussion
//         "notes": 212,           notes struck: rests and tie continuations
//                                 don't count, because a tie extends the note
//                                 before it rather than sounding again
//         "pitches": [40, 52, …]  the fretted pitch of each struck note
//                                 (open string + fret), for pitched tracks
//       }
//     ]
//   }
//
// The facts were chosen because every reader exposes them without
// interpretation, and because each catches a real class of misreading: a
// wrong track count or bar count is a structural misread, a wrong tuning is
// the classic reversed-string bug, and wrong pitches or note counts are what a
// musician hears. Fretted rather than sounding pitch, so a natural harmonic is
// compared where it's played, not where it rings.
//
// Readings stay on the machine that made them (.work/): for a private file,
// the pitches *are* its content. Only verdicts are published.

/**
 * The checks the judge makes, each a projection of a reading. Two readers
 * agree on a check when their projections are equal.
 */
export const CHECKS = [
	{ id: "tracks", label: "Track count", project: r => r.tracks.length },
	{ id: "measures", label: "Bar count", project: r => r.measures },
	{ id: "tempo", label: "Tempo", project: r => Math.round(r.tempo) },
	{
		id: "tuning",
		label: "Tunings",
		project: r => r.tracks.filter(t => !t.percussion).map(t => t.tuning),
	},
	{ id: "notes", label: "Note count", project: r => r.tracks.map(t => t.notes) },
	{
		id: "pitches",
		label: "Pitches",
		// Sorted: readers walk voices and staves in different orders, and the
		// question is whether the right notes arrived, not in which order a
		// library happens to store them.
		project: r => r.tracks.filter(t => !t.percussion).map(t => [...t.pitches].sort((a, b) => a - b)),
	},
]

export const project = (check, reading) => JSON.stringify(check.project(reading))
