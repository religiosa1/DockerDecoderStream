import { DockerDecoderStream } from "../DockerDecoderStream";
import { DockerReadableStreamMock } from "./DockerReadableStreamMock";

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

  it("allows to set the default stream to process", async () => {
    const stream = new DockerReadableStreamMock([
      ["stdout", [1, 2, 3, 4, 5]],
      ["stderr", [3, 2, 1, 6, 7]],
      ["stdout", [6, 7, 8, 9, 0]],
    ]);

    const reader = stream.pipeThrough(new DockerDecoderStream("stderr")).getReader();

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
    expect(result).toEqual([3, 2, 1, 6, 7]);
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
});
