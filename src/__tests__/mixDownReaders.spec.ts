import { IOStreamType } from "../DockerDecoder";
import { DockerDecoderStream } from "../DockerDecoderStream";
import { mixDownReaders } from "../mixDownReaders";
import { DockerReadableStreamMock } from "./DockerReadableStreamMock";
import { isOldNode } from "./isOldNode";

if (isOldNode()) test.only("Skipping mixDownReaders tests in node < 18", () => { });

describe("mixDownReaders", () => {
  class MockReader extends ReadableStream<string> {
    constructor(...data: string[]) {
      const dataClone = data.slice();
      super({
        pull(controller) {
          if (!dataClone.length) {
            return controller.close();
          }
          controller.enqueue(dataClone.shift());
        }
      })
    }
  }

  it("reads data from every reader", async () => {
    const readerA = new MockReader("testA"); 
    const readerB = new MockReader("testB1", "testB2"); 
    const readerC = new MockReader("testC");
    
    const mixDown = mixDownReaders({
      a: readerA.getReader(),
      b: readerB.getReader(),
      c: readerC.getReader(),
    });
    const outputMap = new Map<string, string[]>();
    for await (const [type, chunk] of mixDown) {
      if (!outputMap.has(type)) {
        outputMap.set(type, []);
      }
      const output = outputMap.get(type)!;
      output.push(chunk);
    }
    expect(Array.from(outputMap.keys())).toEqual(expect.arrayContaining([ "a", "b", "c" ]));
    expect(Array.from(outputMap.values())).toEqual(expect.arrayContaining([ ["testA"], ["testB1", "testB2"], ["testC"] ]));
  });

  it("reads data untill the last reader is closed", async () => {
    const readerA = new MockReader(); 
    const readerB = new MockReader("testB1", "testB2", "testB3", "testB4"); 
    const readerC = new MockReader("testC");
    
    const mixDown = mixDownReaders({
      a: readerA.getReader(),
      b: readerB.getReader(),
      c: readerC.getReader(),
    });
    const outputMap = new Map<string, string[]>();
    for await (const [type, chunk] of mixDown) {
      if (!outputMap.has(type)) {
        outputMap.set(type, []);
      }
      const output = outputMap.get(type)!;
      output.push(chunk);
    }
    expect(Array.from(outputMap.keys())).toEqual(expect.arrayContaining([ "b", "c" ]));
    expect(Array.from(outputMap.values())).toEqual(expect.arrayContaining([ ["testB1", "testB2", "testB3", "testB4"], ["testC"] ]));
  });

  it("randomizes the queue, so one stream won't dominate the other", async () => {
    const nItems = 1000;
    const readerA = new MockReader(...Array.from({ length: nItems }, (_,i) => i.toString()));
    const readerB = new MockReader(...Array.from({ length: nItems }, (_,i) => i.toString()));

    const mixDown = mixDownReaders({
      a: readerA.getReader(),
      b: readerB.getReader(),
    });

    let iteration = 0;
    const nHits = {
      a: 0,
      b: 0,
    };
    for await (const [type] of mixDown) {
      nHits[type]++;
      // Going through the half of all available items
      if (iteration >= nItems) {
        break;
      }
      iteration++;
    }
    // should be 0.5 with 5 percent tolerance
    expect(Math.abs(nHits.a / nItems - 0.5)).toBeLessThan(0.05);
    expect(Math.abs(nHits.b / nItems - 0.5)).toBeLessThan(0.05);
  });

  describe("complete multiplexed decoding process a-to-z", () => {
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
});

function mapObject<
  T extends Record<string, unknown>,
  TReturn
>(obj: T, mapper: (value: T[keyof T], key: keyof T) => TReturn): Record<keyof T, TReturn> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key as keyof T, mapper(value as T[keyof T], key)])
  ) as { [k in keyof T]: TReturn };
}

