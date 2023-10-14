const DockerBinaryStreamType = {
  stdin: 0,
  stdout: 1,
  stderr: 2,
} as const;

const HEADER_LENGTH = 8;

/** Creates a docker strea frame. */
export function createDockerFrame(
  payload: Uint8Array | string,
  type: "stdin" | "stdout" | "stderr" = "stdout"
): Uint8Array {
  if (typeof payload === "string") {
    payload = new TextEncoder().encode(payload);
  }
  const frame = new Uint8Array(HEADER_LENGTH + payload.length);
  frame.set(createHeader(payload, type));
  frame.set(payload, HEADER_LENGTH);
  return frame;
}

function createHeader(payload: Uint8Array, type: "stdin" | "stdout" | "stderr"): Uint8Array {
  const header = new Uint8Array(HEADER_LENGTH);
  header[0] = DockerBinaryStreamType[type];
  const length = payload.length >>> 0;
  header[4] = length >>> 24;
  header[5] = length >>> 16;
  header[6] = length >>> 8;
  header[7] = length >>> 0;
  return header;
}