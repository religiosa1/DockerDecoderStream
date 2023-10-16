import { DockerDecoder, IOStreamType } from "../DockerDecoder";
import { concatUint8Arrays } from "../concatUint8Arrays";
import { createDockerFrame } from "./createDockerFrame";

describe("DockerDecoder", () => {
  const dataHandler = jest.fn((type: IOStreamType, p: Uint8Array) => ({ type, payload: p.slice() }));
  const endHandler = jest.fn((type?: IOStreamType, p?: Uint8Array) => type && p && ({ type, payload: p.slice() }));
  const errorHandler = jest.fn();

  function createDecoder() {
    return new DockerDecoder()
      .on("data", dataHandler)
      .on("end", endHandler)
      .on("error", errorHandler);
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("simple chunks parsing", () => {
    it("parses the supplied chunk", () => {
      const data = [3, 2, 1, 6, 7];
      const type = "stdin";
      const frame = createDockerFrame(type, data);

      const decoder = createDecoder();

      decoder.push(frame);

      expect(dataHandler).toBeCalledTimes(1);
      const result = dataHandler.mock.results[0].value;

      expect(result.type).toBe(type);
      expect(result.payload.length).toBe(data.length);
      expect(Array.from(result.payload)).toEqual(data);
    });

    it("parses two small frames one by one in one chunk", () => {
      const data1 = [3, 2, 1, 6, 7];
      const type1 = "stdin";
      const frame1 = createDockerFrame(type1, data1);

      const data2 = [1, 2, 3, 4, 5];
      const type2 = "stderr";
      const frame2 = createDockerFrame(type2, data2);

      const chunk = new Uint8Array(frame1.length + frame2.length);
      chunk.set(frame1);
      chunk.set(frame2, frame1.length);

      const decoder = createDecoder();
      decoder.push(chunk);

      expect(dataHandler).toBeCalledTimes(2);
      expect(errorHandler).not.toBeCalled();
      expect(endHandler).not.toBeCalled();

      const [result1, result2] = dataHandler.mock.results;

      expect(result1.value.type).toBe(type1);
      expect(result1.value.payload.length).toBe(data1.length);
      expect(Array.from(result1.value.payload)).toEqual(data1);

      expect(result2.value.type).toBe(type2);
      expect(result2.value.payload.length).toBe(data2.length);
      expect(Array.from(result2.value.payload)).toEqual(data2);
    });

    it("parses one large frame (bigger than the buffer size)", () => {
      const data = Array(1000).fill([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]).flat();
      const type = "stderr";
      const frame = createDockerFrame(type, data);
      expect(DockerDecoder.defaultBufferSize).toBeLessThan(data.length);

      const decoder = createDecoder();
      decoder.push(frame);

      expect(dataHandler).toBeCalledTimes(2);
      expect(errorHandler).not.toBeCalled();
      expect(endHandler).not.toBeCalled();

      const [result1, result2] = dataHandler.mock.results;

      expect(result1.value.type).toBe(type);
      expect(result1.value.payload.length).toBe(DockerDecoder.defaultBufferSize);
      expect(Array.from(result1.value.payload)).toEqual(data.slice(0, DockerDecoder.defaultBufferSize));

      expect(result2.value.type).toBe(type);
      expect(result2.value.payload.length).toBe(data.length - DockerDecoder.defaultBufferSize);
      expect(Array.from(result2.value.payload)).toEqual(data.slice(DockerDecoder.defaultBufferSize));
    });


    it("omits zero-length frames in chunks, not emitting an event", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
      const type = "stdout";
      const frame = createDockerFrame(type, data);
      const emptyFrame = createDockerFrame("stdin", []);
      const chunk = new Uint8Array(emptyFrame.length + frame.length);
      chunk.set(emptyFrame);
      chunk.set(frame, emptyFrame.length);

      const decoder = createDecoder();
      decoder.push(chunk);

      expect(dataHandler).toBeCalledTimes(1);
      expect(errorHandler).not.toBeCalled();
      expect(endHandler).not.toBeCalled();
      const result = dataHandler.mock.results[0].value;

      expect(result.type).toBe(type);
      expect(result.payload.length).toBe(data.length);
      expect(Array.from(result.payload)).toEqual(data);
    });
  });

  describe("parsing data split between chunk", () => {
    it("parses header if it is split between two chunks", () => {
      const data1 = [3, 2, 1, 6, 7];
      const type1 = "stdin";
      const frame1 = createDockerFrame(type1, data1);

      const data2 = [1, 2, 3, 4, 5];
      const type2 = "stderr";
      const frame2 = createDockerFrame(type2, data2);

      const chunk = new Uint8Array(frame1.length + frame2.length);
      chunk.set(frame1);
      chunk.set(frame2, frame1.length);

      const decoder = createDecoder();
      decoder.push(chunk.slice(0, frame1.length + 4));
      decoder.push(chunk.slice(frame1.length + 4));

      expect(dataHandler).toBeCalledTimes(2);
      expect(errorHandler).not.toBeCalled();
      expect(endHandler).not.toBeCalled();

      const [result1, result2] = dataHandler.mock.results;

      expect(result1.value.type).toBe(type1);
      expect(result1.value.payload.length).toBe(data1.length);
      expect(Array.from(result1.value.payload)).toEqual(data1);

      expect(result2.value.type).toBe(type2);
      expect(result2.value.payload.length).toBe(data2.length);
      expect(Array.from(result2.value.payload)).toEqual(data2);
    });

    it("continues to parse body, if it's in a separate chunk from header", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
      const type = "stdout";
      const frame = createDockerFrame(type, data);

      const decoder = createDecoder();
      decoder.push(frame.slice(0, 8));
      decoder.push(frame.slice(8));

      expect(dataHandler).toBeCalledTimes(1);
      expect(errorHandler).not.toBeCalled();
      expect(endHandler).not.toBeCalled();
      const result = dataHandler.mock.results[0].value;

      expect(result.type).toBe(type);
      expect(result.payload.length).toBe(data.length);
      expect(Array.from(result.payload)).toEqual(data);
    });

    it("continues to parse body, if it's split in two chunks", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
      const type = "stdout";
      const frame = createDockerFrame(type, data);

      const decoder = createDecoder();
      decoder.push(frame.slice(0, 8 + 4));
      decoder.push(frame.slice(8 + 4));

      expect(dataHandler).toBeCalledTimes(1);
      expect(errorHandler).not.toBeCalled();
      expect(endHandler).not.toBeCalled();
      const result = dataHandler.mock.results[0].value;

      expect(result.type).toBe(type);
      expect(result.payload.length).toBe(data.length);
      expect(Array.from(result.payload)).toEqual(data);
    });
  });


  describe("'end' event emit", () => {
    it("emits an 'end' with zero-length data when 'close' is called in the start of the body", () => {
      const data = [3, 2, 1, 6, 7];
      const type = "stdin";
      const frame = createDockerFrame(type, data);

      const decoder = createDecoder();
      decoder.push(frame.slice(0, 8));
      decoder.close();

      expect(dataHandler).toBeCalledTimes(0);
      expect(endHandler).toBeCalledTimes(1);
      expect(errorHandler).not.toBeCalled();
      const result = endHandler.mock.results[0].value;

      expect(result.type).toBe(type);
      expect(result.payload.length).toBe(0);
    });

    it("emits an 'end' event when with data when 'close' is called in a middle of a body", () => {
      const data = [3, 2, 1, 6, 7];
      const type = "stdin";
      const frame = createDockerFrame(type, data);

      const decoder = createDecoder();
      decoder.push(frame.slice(0, -2));
      decoder.close();

      expect(dataHandler).toBeCalledTimes(0);
      expect(endHandler).toBeCalledTimes(1);
      expect(errorHandler).not.toBeCalled();
      const result = endHandler.mock.results[0].value;

      expect(result.type).toBe(type);
      expect(result.payload.length).toBe(data.length - 2);
      expect(Array.from(result.payload)).toEqual(data.slice(0, -2));
    });

    it("emits an 'end' with no argument, when 'close' is called in the middle of header parsing", () => {
      const data = [3, 2, 1, 6, 7];
      const type = "stdin";
      const frame = createDockerFrame(type, data);

      const decoder = createDecoder();
      decoder.push(frame.slice(0, 4));
      decoder.close();

      expect(dataHandler).toBeCalledTimes(0);
      expect(endHandler).toBeCalledTimes(1);
      expect(errorHandler).not.toBeCalled();
      const result = endHandler.mock.results[0].value;

      expect(result).toBeUndefined();
    });

    it("resets decoder state, when 'close' is called", () => {
      const data = [3, 2, 1, 6, 7];
      const type = "stdin";
      const frame = createDockerFrame(type, data);

      const decoder = createDecoder();
      decoder.push(frame.slice(0, -2));
      decoder.close();
      decoder.push(frame);


      expect(dataHandler).toBeCalledTimes(1);
      expect(endHandler).toBeCalledTimes(1);
      expect(errorHandler).not.toBeCalled();
      const result = dataHandler.mock.results[0].value;

      expect(result.type).toBe(type);
      expect(result.payload.length).toBe(data.length);
      expect(Array.from(result.payload)).toEqual(data);
    });
  });

  describe("error handling", () => {
    it("emits an 'error' event if malformed header is encountered", () => {
      const data = [3, 2, 1, 6, 7];
      const type = "stdin";
      const frame = createDockerFrame(type, data);
      frame[0] = 123;

      const decoder = createDecoder();
      decoder.push(frame);

      expect(dataHandler).not.toBeCalled();
      expect(endHandler).not.toBeCalled();
      expect(errorHandler).toBeCalledTimes(1);
      expect(errorHandler).toBeCalledWith(expect.any(Error))
    });

    it("bad buffer size values in costructor result in an error", () => {
      expect(() => new DockerDecoder(9.75)).toThrow(TypeError);
      expect(() => new DockerDecoder(7)).toThrow(RangeError);
    });
  });

  describe("decode calls", () => {
    it("decodes a passed chunk", () => {
      const data = [3, 2, 1, 6, 7];
      const type = "stdin";
      const frame = createDockerFrame(type, data);

      const result = new DockerDecoder().decode(frame);

      expect(Array.from(result.stdin)).toEqual(data);
      expect(Array.from(result.stdout)).toEqual([]);
      expect(Array.from(result.stderr)).toEqual([]);
    });

    it("decodes multiple frames in one chunk", () => {
      const chunk = concatUint8Arrays([
        createDockerFrame("stdout", [3, 2, 1]),
        createDockerFrame("stderr", [5]),
        createDockerFrame("stdout", [6, 7]),
        createDockerFrame("stdin", []),
        createDockerFrame("stdin", []),
        createDockerFrame("stderr", [5]),
        createDockerFrame("stderr", [5]),
      ]);

      const result = new DockerDecoder().decode(chunk);

      expect(Array.from(result.stdin)).toEqual([]);
      expect(Array.from(result.stdout)).toEqual([3, 2, 1, 6, 7]);
      expect(Array.from(result.stderr)).toEqual([5, 5, 5]);
    });

    it("decodes partially read frames at the end", () => {
      const chunk = concatUint8Arrays([
        createDockerFrame("stdout", [3, 2, 1]),
        createDockerFrame("stderr", [5]),
        createDockerFrame("stdout", [6, 7, 1]),
      ]);

      const result = new DockerDecoder().decode(chunk.subarray(0, -1));

      expect(Array.from(result.stdin)).toEqual([]);
      expect(Array.from(result.stdout)).toEqual([3, 2, 1, 6, 7]);
      expect(Array.from(result.stderr)).toEqual([5]);
    });


    it("incomplete chunk returns nothing", () => {
      const frame = createDockerFrame("stdin", [1, 2, 3]);

      const result = new DockerDecoder().decode(frame.slice(0, 3));

      expect(Array.from(result.stdin)).toEqual([]);
      expect(Array.from(result.stdout)).toEqual([]);
      expect(Array.from(result.stderr)).toEqual([]);
    });

    it("throws an error, if docker header is malformed", () => {
      const data = [3, 2, 1, 6, 7];
      const type = "stdin";
      const frame = createDockerFrame(type, data);
      frame[0] = 123;

      const decoder = new DockerDecoder();
      expect(() => decoder.decode(frame)).toThrow();
    });
  });
});