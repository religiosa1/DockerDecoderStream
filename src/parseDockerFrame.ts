export function parseDockerFrameType(buffer: Uint8Array): "stdin" | "stdout" | "stderr" {
  switch (buffer[0]) {
    case 0:
      return "stdin";
    case 1:
      return "stdout";
    case 2:
      return "stderr";
    default:
      throw new Error(`Incorrect docker frame type: ${buffer[0]}`);
  }
}

export function parseDockerFrameLength(buffer: Uint8Array): number {
  return (
    (buffer[4] << 24) |
    (buffer[5] << 16) |
    (buffer[6] << 8) |
    (buffer[7])
  );
}