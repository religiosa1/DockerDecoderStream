import { createDockerFrame } from "./createDockerFrame";
import { parseDockerFrameLength, parseDockerFrameType } from "../parseDockerFrame";

const HEADER_LENGTH = 8
describe("createDockerFrame", () => {
  it("creates a frame", () => {
    const data = [3, 2, 1, 6, 7];
    const frame = createDockerFrame(new Uint8Array(data));
    expect(parseDockerFrameType(frame)).toBe("stdout");
    expect(parseDockerFrameLength(frame)).toBe(data.length);
    expect(Array.from(frame.subarray(HEADER_LENGTH))).toEqual(data);
  });

  it("encodes an ASCII string", () => {
    const data = "Hello World!";
    const frame = createDockerFrame(data);
    expect(parseDockerFrameType(frame)).toBe("stdout");
    expect(parseDockerFrameLength(frame)).toBe(data.length);
    const stringRepr = new TextDecoder("utf-8").decode(frame.subarray(HEADER_LENGTH));
    expect(stringRepr).toEqual(data);
  });

  it("sets the correct frame", () => {
    const data = new Uint8Array([3, 2, 1, 6, 7]);
    const frameIn = createDockerFrame(data, "stdin");
    const frameOut = createDockerFrame(data, "stdout");
    const frameErr = createDockerFrame(data, "stderr");
    expect(parseDockerFrameType(frameIn)).toBe("stdin");
    expect(parseDockerFrameType(frameOut)).toBe("stdout");
    expect(parseDockerFrameType(frameErr)).toBe("stderr");
  });
});