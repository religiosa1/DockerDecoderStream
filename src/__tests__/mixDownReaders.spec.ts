import { IOStreamType } from "../DockerDecoder";
import { DockerDecoderStream } from "../DockerDecoderStream";
import { mixDownReaders } from "../mixDownReaders";
import { DockerReadableStreamMock } from "./DockerReadableStreamMock";
import { isOldNode } from "./isOldNode";

if (isOldNode()) test.only("Skipping mixDownReaders tests in node < 18", () => { });

describe("mixDownReaders", () => {
  it("allows to get a ReadableStream for each IOStream in DockerStream", async () => {
    const stream = new DockerReadableStreamMock([
      ["stdout", [4, 5, 6]],
      ["stdin", [1, 2, 3]],
      ["stderr", [7, 8, 9]],
      ["stdout", [6, 5, 4]],
      ["stdin", [3, 2, 1]],
      ["stderr", [9, 8, 7]],
    ]);
    const dockerStream = new DockerDecoderStream();

    const readers: Record<IOStreamType, ReadableStreamDefaultReader<Uint8Array>> = {
      stdin: dockerStream.stdin.getReader(),
      stdout: dockerStream.stdout.getReader(),
      stderr: dockerStream.stderr.getReader(),
    };
    stream.pipeTo(dockerStream.writable);
    const reader = mixDownReaders(readers);
    const chunks = mapObject(readers, (): Uint8Array[] => []);
    for await (const [type, value] of reader) {
      chunks[type].push(value);
    }
    const results = mapObject(chunks, (chks) => chks.flatMap((chunk) => Array.from(chunk)));
    expect(results.stdin).toEqual([1, 2, 3, 3, 2, 1]);
    expect(results.stdout).toEqual([4, 5, 6, 6, 5, 4]);
    expect(results.stderr).toEqual([7, 8, 9, 9, 8, 7]);
  });
});

function mapObject<
  T extends Record<string, unknown>,
  TReturn
>(obj: T, mapper: (value: T[keyof T], key: keyof T) => TReturn): Record<keyof T, TReturn> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key as keyof T, mapper(value as T[keyof T], key)])
  ) as { [k in keyof T]: TReturn };
}

