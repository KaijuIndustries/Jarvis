/**
 * Streaming sentence splitter for Orb speech.
 * Chunks may split mid-sentence; incomplete text stays buffered until a
 * real boundary (or flush at end of stream).
 */

const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "vs",
  "etc",
  "inc",
  "ltd",
  "st",
  "rd",
  "ave",
  "fig",
  "vol",
  "approx",
  "est",
  "dept",
  "gen",
  "gov",
  "lt",
  "col",
  "sgt",
  "rev",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
  "am",
  "pm",
  "eg",
  "ie",
  "al",
  "no",
  "nos",
  "co",
  "corp",
  "bros",
]);

function wordBefore(text: string, punctIndex: number): string {
  let i = punctIndex - 1;
  while (i >= 0 && /[A-Za-z]/.test(text[i] ?? "")) i -= 1;
  return text.slice(i + 1, punctIndex);
}

function followupStartsSentence(text: string, afterPunct: number): boolean {
  let i = afterPunct;
  while (i < text.length && /\s/.test(text[i] ?? "")) i += 1;
  if (i >= text.length) return false;
  const ch = text[i] ?? "";
  return /[A-Z0-9]/.test(ch) || ch === '"' || ch === "'" || ch === "“" || ch === "‘" || ch === "(" || ch === "[";
}

function isValidSentencePunct(text: string, index: number): boolean {
  const ch = text[index];
  if (ch !== "." && ch !== "?" && ch !== "!") return false;

  const prev = text[index - 1];
  const next = text[index + 1];

  if (ch === ".") {
    if (prev && /\d/.test(prev) && next && /\d/.test(next)) return false;
    if (next === ".") return false;
    if (next !== undefined && !/\s/.test(next)) return false;

    const word = wordBefore(text, index);
    if (ABBREVIATIONS.has(word.toLowerCase())) return false;
    if (/^[A-Z]$/.test(word)) return false;
  } else if (next !== undefined && !/\s/.test(next)) {
    return false;
  }

  return true;
}

function findSplit(text: string, flush: boolean): number | null {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n" && text[i + 1] === "\n") {
      if (!text.slice(0, i).trim()) continue;
      if (flush || /\S/.test(text.slice(i + 2))) return i;
    }

    if (!isValidSentencePunct(text, i)) continue;
    const afterPunct = i + 1;
    if (flush) {
      const next = text[afterPunct];
      if (next === undefined || /\s/.test(next)) return afterPunct;
      continue;
    }
    if (followupStartsSentence(text, afterPunct)) return afterPunct;
  }
  return null;
}

function normalizeSentence(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export class SentenceBuffer {
  private buffer = "";

  push(chunk: string): string[] {
    if (chunk === "") return [];
    this.buffer += chunk;
    return this.extract(false);
  }

  flush(): string[] {
    const sentences = this.extract(true);
    const rest = normalizeSentence(this.buffer);
    this.buffer = "";
    if (rest) sentences.push(rest);
    return sentences;
  }

  reset() {
    this.buffer = "";
  }

  private extract(flush: boolean): string[] {
    const sentences: string[] = [];
    while (this.buffer.length > 0) {
      const splitAt = findSplit(this.buffer, flush);
      if (splitAt === null) break;
      const sentence = normalizeSentence(this.buffer.slice(0, splitAt));
      this.buffer = this.buffer.slice(splitAt).replace(/^\s+/, "");
      if (sentence) sentences.push(sentence);
    }
    return sentences;
  }
}
