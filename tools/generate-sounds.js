import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Constants
const sampleRate = 22_050;
const peak = 0.8;
const outputDirectory = join(import.meta.dirname, "..", "web", "assets", "sounds");
const fanfareRatios = [1, 1.25, 1.5];
const sparkleNotes = [1568, 1760, 2093, 2349, 2637, 3136];
const levelUpNotes = [523.25, 659.25, 783.99, 1046.5];

// Sounds
const sounds = {
  chime: () =>
    render(0.95, (time) =>
      note(time, 0, 1318.5, 0.45) + note(time, 0.12, 1975.5, 0.55),
    ),
  pop: () =>
    render(0.22, (time) => {
      const frequency = 520 + 900 * Math.min(1, time / 0.06);
      return Math.sin(2 * Math.PI * frequency * time) * Math.exp(-time * 28);
    }),
  bell: () =>
    render(1.6, (time) =>
      [1, 2.01, 2.76, 5.4].reduce(
        (sum, ratio, index) => sum + Math.sin(2 * Math.PI * 880 * ratio * time) * Math.exp(-time * (2.2 + index * 1.6)) / (index + 1),
        0,
      ),
    ),
  coin: () =>
    render(0.6, (time) => voice(time, 0, 0.08, 988, square, 0.05) + voice(time, 0.08, 0.5, 1318.5, square, 0.22)),
  "level-up": () =>
    render(0.75, (time) => levelUpNotes.reduce((sum, frequency, index) => sum + voice(time, index * 0.09, 0.4, frequency, triangle, 0.14), 0)),
  fanfare: () =>
    render(1.2, (time) =>
      [
        [392, 0, 0.18],
        [392, 0.2, 0.18],
        [523.25, 0.4, 0.75],
      ].reduce(
        (sum, [frequency, start, length]) =>
          sum + fanfareRatios.reduce((chord, ratio) => chord + voice(time, start, length, frequency * ratio, brass, length * 0.6), 0),
        0,
      ),
    ),
  sparkle: () =>
    render(1, (time) => sparkleNotes.reduce((sum, frequency, index) => sum + voice(time, index * 0.06, 0.6, frequency, Math.sin, 0.12), 0)),
  whoosh: () => {
    const random = seededRandom(7);
    const count = Math.round(0.75 * sampleRate);
    const samples = new Float64Array(count);
    let low = 0;
    let band = 0;
    for (let index = 0; index < count; index++) {
      const progress = index / count;
      const cutoff = 300 * (5000 / 300) ** progress;
      const factor = 2 * Math.sin((Math.PI * cutoff) / sampleRate);
      const high = random() * 2 - 1 - low - 0.6 * band;
      band += factor * high;
      low += factor * band;
      samples[index] = band * Math.sin(Math.PI * progress) ** 1.5;
    }
    return normalize(samples);
  },
  bubble: () =>
    render(0.32, (time) => glide(time, 0, 0.12, 300, 700) + 0.8 * glide(time, 0.13, 0.15, 450, 1000)),
  "drum-hit": () => {
    const random = seededRandom(11);
    return render(0.5, (time) => {
      const body = Math.sin(2 * Math.PI * 45 * time + (2 * Math.PI * (150 - 45) * (1 - Math.exp(-time * 18))) / 18) * Math.exp(-time * 9);
      const snap = time < 0.15 ? (random() * 2 - 1) * Math.exp(-time * 30) * 0.35 : 0;
      return body + snap;
    });
  },
};

// Waves
function square(phase) {
  return Math.sign(Math.sin(phase)) * 0.6;
}

function triangle(phase) {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

function brass(phase) {
  let sum = 0;
  for (let harmonic = 1; harmonic <= 8; harmonic++) {
    sum += Math.sin(phase * harmonic) / harmonic;
  }
  return sum * 0.5;
}

function voice(time, start, length, frequency, wave, decay) {
  const local = time - start;
  if (local < 0 || local > length + decay * 3) {
    return 0;
  }
  const attack = Math.min(1, local / 0.006);
  const release = local > length ? Math.exp(-(local - length) / decay) : 1;
  return attack * release * Math.exp(-local / (length + decay)) * wave(2 * Math.PI * frequency * local);
}

function glide(time, start, length, from, to) {
  const local = time - start;
  if (local < 0 || local > length) {
    return 0;
  }
  const ratio = to / from;
  const phase = (2 * Math.PI * from * length * (ratio ** (local / length) - 1)) / Math.log(ratio);
  return Math.sin(phase) * Math.sin((Math.PI * local) / length);
}

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function note(time, start, frequency, decay) {
  const local = time - start;
  if (local < 0) {
    return 0;
  }
  const attack = Math.min(1, local / 0.005);
  const tone = Math.sin(2 * Math.PI * frequency * local) + 0.25 * Math.sin(4 * Math.PI * frequency * local);
  return attack * tone * Math.exp(-local / decay * 4);
}

// Rendering
function render(duration, sample) {
  const count = Math.round(duration * sampleRate);
  const samples = Float64Array.from({ length: count }, (_, index) => sample(index / sampleRate));
  const fadeOut = Math.round(0.02 * sampleRate);
  for (let index = 0; index < fadeOut; index++) {
    samples[count - 1 - index] *= index / fadeOut;
  }
  return normalize(samples);
}

function normalize(samples) {
  const maximum = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0) || 1;
  return samples.map((value) => (value / maximum) * peak);
}

function toWav(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  samples.forEach((value, index) => buffer.writeInt16LE(Math.round(value * 32_767), 44 + index * 2));
  return buffer;
}

// Output
mkdirSync(outputDirectory, { recursive: true });
for (const [name, create] of Object.entries(sounds)) {
  const file = join(outputDirectory, `${name}.wav`);
  writeFileSync(file, toWav(create()));
  console.log(`Wrote ${file}`);
}
