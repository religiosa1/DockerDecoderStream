export function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((acc, cur) => acc + cur.length, 0);
  const combined = new Uint8Array(length);
  let currentIndex = 0;
  for (const chunk of chunks) {
    combined.set(chunk, currentIndex);
    currentIndex += chunk.length;
  }
  return combined;
}