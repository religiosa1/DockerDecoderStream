import { DockerDecoderStream } from "../DockerDecoderStream";
import { DockerReadableStreamMock } from "./DockerReadableStreamMock";
import { createDockerFrame } from "./createDockerFrame";
import { isOldNode } from "./isOldNode";

if (isOldNode()) test.only("Skipping DockerDecoderStream tests in node < 18", () => { });

describe("DockerDecoderStream", () => {
  it("parses stream, filtering the correct datatype", async () => {
    const stream = new DockerReadableStreamMock([
      ["stdout", [1, 2, 3, 4, 5]],
      ["stderr", [1, 2, 3, 4, 5]],
      ["stdout", [6, 7, 8, 9, 0]],
    ]);

    const reader = stream.pipeThrough(new DockerDecoderStream()).getReader();

    const chunks: Uint8Array[] = [];
    for (; ;) {
      const { value, done } = await reader.read();
      if (value !== undefined) {
        chunks.push(value);
      }
      if (done) {
        break;
      }
    }
    const result = chunks.flatMap((chunk) => Array.from(chunk));
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  });

  it.each([
    ["stdin" as const, [3, 3, 3]],
    ["stdout" as const, [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]],
    ["stderr" as const, [3, 2, 1, 6, 7]]
  ])("allows to set the default stream to process %p", async (streamName, expectedResult) => {
    const stream = new DockerReadableStreamMock([
      ["stdout", [1, 2, 3, 4, 5]],
      ["stdin", [3]],
      ["stderr", [3, 2, 1, 6, 7]],
      ["stdout", [6, 7, 8, 9, 0]],
      ["stdin", [3, 3]],
    ]);

    const reader = stream.pipeThrough(new DockerDecoderStream(streamName)).getReader();

    const chunks: Uint8Array[] = [];
    for (; ;) {
      const { value, done } = await reader.read();
      if (value !== undefined) {
        chunks.push(value);
      }
      if (done) {
        break;
      }
    }
    const result = chunks.flatMap((chunk) => Array.from(chunk));
    expect(result).toEqual(expectedResult);
  });

  it("throws TypeError on readable stream retriving, if bad default stream name is provided", () => {
    expect(
      () => {
        // @ts-expect-error
        new DockerDecoderStream("badname").readable
      }
    ).toThrow(TypeError);
    expect(
      () => {
        const decoder = new DockerDecoderStream();
        // @ts-expect-error
        decoder.defaultStreamType = "adsfsdf"
        decoder.readable
      }
    ).toThrow(TypeError);
  });


  it("allows to read directly from the desired stream", async () => {
    const stream = new DockerReadableStreamMock([
      ["stdout", [4, 5, 6]],
      ["stdin", [1, 2, 3]],
      ["stderr", [7, 8, 9]],
      ["stdout", [4, 5, 6]],
      ["stdin", [1, 2, 3]],
      ["stderr", [9, 8, 7]],
    ]);
    const dockerStream = new DockerDecoderStream();
    stream.pipeTo(dockerStream.writable);
    const reader = dockerStream.stderr.getReader();

    const chunks: Uint8Array[] = [];
    for (; ;) {
      const { value, done } = await reader.read();
      if (value !== undefined) {
        chunks.push(value);
      }
      if (done) {
        break;
      }
    }
    const result = chunks.flatMap((chunk) => Array.from(chunk));
    expect(result).toEqual([7, 8, 9, 9, 8, 7]);
  });

  describe("error handling",  () => {
    it("throws an error if writable stream is malformed", async () => {
      const badFrame = createDockerFrame("stdout", [4, 5, 6]);
      badFrame[0] = 321;
      const stream =  new DockerReadableStreamMock([
        badFrame
      ]);
      const dockerStream = new DockerDecoderStream();
      await expect(() => stream.pipeTo(dockerStream.writable)).rejects.toThrow();
    });

    it("throws an error in reader if writableStream error was surpressed", async () => {
      const badFrame = createDockerFrame("stdout", [4, 5, 6]);
      badFrame[0] = 321;
      const stream =  new DockerReadableStreamMock([
        badFrame
      ]);
      const dockerStream = new DockerDecoderStream();
      stream.pipeTo(dockerStream.writable).catch(() => { });
      const reader = dockerStream.stdout.getReader();
      await expect(() => reader.read()).rejects.toThrow();
    });

    it.todo("aborts the writetable stream on signal");
    it.todo("aborts the readable stream on signal");

  });
});
