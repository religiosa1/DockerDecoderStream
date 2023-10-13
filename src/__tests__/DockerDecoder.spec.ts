import { DockerDecoder, DockerStreamFrame } from "../DockerDecoder";
import { createDockerFrame } from "../createDockerFrame";

describe("DockerLogsDecoder", () => {
  const dataHandler = jest.fn((v: DockerStreamFrame) => ({ type: v.type, payload: v.payload.slice() }));
  const endHandler = jest.fn((v?: DockerStreamFrame) => v && ({ type: v.type, payload: v.payload.slice() }));
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
      const frame = createDockerFrame(new Uint8Array(data), type);

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
      const frame1 = createDockerFrame(new Uint8Array(data1), type1);

      const data2 = [1, 2, 3, 4, 5];
      const type2 = "stderr";
      const frame2 = createDockerFrame(new Uint8Array(data2), type2);

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
      const frame = createDockerFrame(new Uint8Array(data), type);
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
      const frame = createDockerFrame(new Uint8Array(data), type);
      const emptyFrame = createDockerFrame(new Uint8Array(0), "stdin");
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
      const frame1 = createDockerFrame(new Uint8Array(data1), type1);

      const data2 = [1, 2, 3, 4, 5];
      const type2 = "stderr";
      const frame2 = createDockerFrame(new Uint8Array(data2), type2);

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
      const frame = createDockerFrame(new Uint8Array(data), type);

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
      const frame = createDockerFrame(new Uint8Array(data), type);

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
      const frame = createDockerFrame(new Uint8Array(data), type);

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
      const frame = createDockerFrame(new Uint8Array(data), type);

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
      const frame = createDockerFrame(new Uint8Array(data), type);

      const decoder = createDecoder();
      decoder.push(frame.slice(0, 4));
      decoder.close();

      expect(dataHandler).toBeCalledTimes(0);
      expect(endHandler).toBeCalledTimes(1);
      expect(errorHandler).not.toBeCalled();
      const result = endHandler.mock.results[0].value;

      expect(result).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("emits an 'error' event if malformed header is encountered", () => {
      const data = [3, 2, 1, 6, 7];
      const type = "stdin";
      const frame = createDockerFrame(new Uint8Array(data), type);
      frame[0] = 123;

      const decoder = createDecoder();
      decoder.push(frame);

      expect(dataHandler).not.toBeCalled();
      expect(endHandler).not.toBeCalled();
      expect(errorHandler).toBeCalledTimes(1);
      expect(errorHandler).toBeCalledWith(expect.any(Error))
    });
  });
});