import { IOStreamType } from "../DockerDecoder";

const DockerBinaryStreamType = {
  stdin: 0,
  stdout: 1,
  stderr: 2,
} as const;

const HEADER_LENGTH = 8;

/** Creates a docker strea frame. */
export function createDockerFrame(
  type: IOStreamType,
  payload: ArrayLike<number> | string,
): Uint8Array {
  if (typeof payload === "string") {
    payload = new TextEncoder().encode(payload);
  }
  const frame = new Uint8Array(HEADER_LENGTH + payload.length);
  frame.set(createHeader(type, payload.length));
  frame.set(payload, HEADER_LENGTH);
  return frame;
}

function createHeader(type: "stdin" | "stdout" | "stderr", frameLength: number): Uint8Array {
  const header = new Uint8Array(HEADER_LENGTH);
  header[0] = DockerBinaryStreamType[type];
  header[4] = frameLength >>> 24;
  header[5] = frameLength >>> 16;
  header[6] = frameLength >>> 8;
  header[7] = frameLength >>> 0;
  return header;
}