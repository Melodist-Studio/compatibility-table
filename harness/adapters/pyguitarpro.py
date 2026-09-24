"""PyGuitarPro's reading of one file. Usage: python pyguitarpro.py <file>

PyGuitarPro numbers strings from the highest (string 1) and lists them in
that order, each carrying its open MIDI pitch, so a note's open string is
strings[string - 1] and the tuning reads lowest first once reversed.

A grace note is an effect on the note it leads into, where other readers
store it as a note of its own. It is struck all the same, so it counts as one.
"""

import json
import sys

import guitarpro

NOT_STRUCK = {guitarpro.NoteType.tie, guitarpro.NoteType.rest}


def struck(note):
    """(string, fret) of everything struck at this note: its grace note, then itself."""
    grace = note.effect.grace
    return ([(note.string, grace.fret)] if grace else []) + [(note.string, note.value)]


def read_track(track):
    percussion = track.isPercussionTrack
    notes = [
        played
        for measure in track.measures
        for voice in measure.voices
        for beat in voice.beats
        for note in beat.notes
        if note.type not in NOT_STRUCK
        for played in struck(note)
    ]
    return {
        "percussion": percussion,
        "tuning": None if percussion else [string.value for string in reversed(track.strings)],
        "notes": len(notes),
        "pitches": [] if percussion else [track.strings[string - 1].value + fret for string, fret in notes],
    }


song = guitarpro.parse(sys.argv[1])
sys.stdout.write(
    json.dumps(
        {
            "measures": len(song.measureHeaders),
            "tempo": song.tempo,
            "tracks": [read_track(track) for track in song.tracks],
        }
    )
)
