// Pure scale maths for the music engine. A minor pentatonic for melody and arp, A natural
// minor for pads and bass. Notes are MIDI numbers; A4 = 69 = 440 Hz.

/** Pitch classes (C = 0) of A minor pentatonic: A C D E G. */
export const PENTATONIC_PCS: readonly number[] = [9, 0, 2, 4, 7];
/** Pitch classes of A natural minor: A B C D E F G. */
export const NATURAL_MINOR_PCS: readonly number[] = [9, 11, 0, 2, 4, 5, 7];
/** Semitone offsets above A for each pentatonic degree. */
const PENTA_OFFSETS: readonly number[] = [0, 3, 5, 7, 10];

export const A4 = 69;

/** Pitch class 0 to 11 of a MIDI note (works for negatives). */
export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function inPentatonic(midi: number): boolean {
  return PENTATONIC_PCS.includes(pitchClass(midi));
}

export function inNaturalMinor(midi: number): boolean {
  return NATURAL_MINOR_PCS.includes(pitchClass(midi));
}

/** MIDI note to Hz, equal temperament. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - A4) / 12);
}

/**
 * Pentatonic degree to MIDI. Degree 0 is `root` (an A), 5 is the A an octave up, negative
 * degrees go down (-1 is the G below root).
 */
export function pentatonicMidi(degree: number, root: number = A4): number {
  const d = Math.trunc(degree);
  const oct = Math.floor(d / 5);
  const idx = d - oct * 5;
  return root + oct * 12 + (PENTA_OFFSETS[idx] ?? 0);
}
