import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Constants
const sampleRate = 22_050;
const peak = 0.8;
const outputDirectory = join(import.meta.dirname, "..", "web", "assets", "sounds");

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
};

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
