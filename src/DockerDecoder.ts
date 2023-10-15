import { EventEmitter } from "eventemitter3";
import { assert } from "./assert";
import { parseDockerFrameLength, parseDockerFrameType } from "./parseDockerFrame";
import { concatUint8Arrays } from "./concatUint8Arrays";

export type IOStreamType = "stdin" | "stdout" | "stderr";

const DecoderState = {
  header: 0,
  payload: 1,
} as const;
type DecoderState = typeof DecoderState[keyof typeof DecoderState];

const HEADER_LENGTH = 8;

/**
 * Decoder for Docker logs stream.
 * 
 * @see https://docs.docker.com/engine/api/v1.37/#tag/Container/operation/ContainerAttach
 * header := [8]byte{STREAM_TYPE, 0, 0, 0, SIZE1, SIZE2, SIZE3, SIZE4}
 */
export class DockerDecoder extends EventEmitter<{
  data: (type: IOStreamType, payload: Uint8Array) => any;
  end: (type?: IOStreamType, payload?: Uint8Array) => any;
  error: (err: unknown) => any;
}> {
  static readonly defaultBufferSize = 8192;

  #state: DecoderState = DecoderState.header;
  #nBytesRead = 0;
  #nBytesReadInFrameTotal = 0;
  #frameType: IOStreamType = "stdout";
  #frameLength = 0;
  readonly #buffer: Uint8Array;

  get bufferLength(): number {
    return this.#buffer.length;
  }

  constructor(bufferLength = DockerDecoder.defaultBufferSize) {
    super();
    if (!Number.isInteger(bufferLength)) {
      throw new TypeError("Buffer length must be an integer");
    }
    if (bufferLength <= HEADER_LENGTH) {
      throw new RangeError(`Buffer length cannot be <= ${HEADER_LENGTH}`);
    }
    this.#buffer = new Uint8Array(bufferLength);
  }

  decode(chunk: Uint8Array): Record<IOStreamType, Uint8Array> {
    const chunks: Record<IOStreamType, Uint8Array[]> = {
      stdin: [],
      stdout: [],
      stderr: [],
    };
    const enqueue = (type?: IOStreamType, payload?: Uint8Array) => {
      if (!type || !payload) { return }
      chunks[type].push(payload.slice());
    };
    this.#decode(chunk, enqueue);
    this.#close(enqueue);

    return {
      stdin: concatUint8Arrays(chunks.stdin),
      stdout: concatUint8Arrays(chunks.stdout),
      stderr: concatUint8Arrays(chunks.stderr),
    }
  }

  push(chunk: Uint8Array): void {
    try {
      this.#decode(chunk, (type, payload) => this.emit("data", type, payload));
    } catch (e) {
      this.emit("error", e);
    }
  }

  close(): void {
    this.#close((type, payload) => this.emit("end", type, payload));
  }

  #close(enqueue: (type?: IOStreamType, payload?: Uint8Array) => void): void {
    if (this.#state === DecoderState.payload) {
      enqueue(this.#frameType, this.#buffer.subarray(0, this.#nBytesRead));
    } else {
      enqueue();
    }
    this.#nBytesRead = 0;
    this.#nBytesReadInFrameTotal = 0;
    this.#state = DecoderState.header;
  }

  #decode(chunk: Uint8Array, enqueue: (type: IOStreamType, payload: Uint8Array) => void): void {
    while (chunk.length) {
      const length = chunk.length;
      if (this.#state === DecoderState.header) {
        const bytesToRead = Math.min(HEADER_LENGTH - this.#nBytesRead, chunk.length);
        assert(bytesToRead > 0, "Error during header chunk processing");
        this.#buffer.set(chunk.subarray(0, bytesToRead), this.#nBytesRead);
        chunk = chunk.subarray(bytesToRead);
        this.#nBytesRead += bytesToRead;
        if (this.#nBytesRead >= HEADER_LENGTH) {
          this.#frameType = parseDockerFrameType(this.#buffer);
          this.#frameLength = parseDockerFrameLength(this.#buffer);
          this.#nBytesRead = 0;
          if (this.#frameLength) {
            this.#state = DecoderState.payload;
          }
        }
      }
      if (this.#state === DecoderState.payload && chunk.length) {
        const bytesToRead = Math.min(
          this.#frameLength - this.#nBytesRead,
          this.#buffer.length - this.#nBytesRead,
          chunk.length
        );
        assert(bytesToRead > 0, `DockerStreamDecoder have some data to read (${bytesToRead} > 0)`);
        assert(this.#nBytesRead < this.#buffer.length, `Buffer has enough space to acommodate the data (${this.#nBytesRead} < ${this.#buffer.length})`);
        this.#buffer.set(chunk.subarray(0, bytesToRead), this.#nBytesRead);
        chunk = chunk.subarray(bytesToRead);
        this.#nBytesRead += bytesToRead;
        this.#nBytesReadInFrameTotal += bytesToRead;
        const frameCompleted = this.#nBytesReadInFrameTotal >= this.#frameLength;
        if (frameCompleted || this.#nBytesRead >= this.#buffer.length) {
          const payload = this.#buffer.subarray(0, this.#nBytesRead);
          this.#nBytesRead = 0;
          if (frameCompleted) {
            this.#state = DecoderState.header;
            this.#nBytesReadInFrameTotal = 0;
          }
          enqueue(this.#frameType, payload);
        }
      }
      assert(length > chunk.length, `Data processed during DockerStreamDecoder iteration (${length} > ${chunk.length})`);
    }
  }
}
