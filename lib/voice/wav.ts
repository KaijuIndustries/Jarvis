export function pcmToWav(
  pcm: Buffer,
  rate: number,
  width: number,
  channels: number,
): Buffer {
  if (!Number.isInteger(rate) || rate < 8_000 || rate > 96_000) {
    throw new Error("invalid_wav_rate");
  }
  if (!Number.isInteger(width) || width < 1 || width > 4) {
    throw new Error("invalid_wav_width");
  }
  if (!Number.isInteger(channels) || channels < 1 || channels > 2) {
    throw new Error("invalid_wav_channels");
  }

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * width, 28);
  header.writeUInt16LE(channels * width, 32);
  header.writeUInt16LE(width * 8, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
