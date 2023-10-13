import { EventEmitter } from "eventemitter3";
import { assert } from "./assert";
import { parseDockerFrameLength, parseDockerFrameType } from "./parseDockerFrame";

export interface DockerStreamFrame {
  type: "stdin" | "stdout" | "stderr",
  payload: Uint8Array;
}

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
  data: (frame: DockerStreamFrame) => any;
  end: (frame: DockerStreamFrame | undefined) => any;
  error: (err: unknown) => any;
}> {
  static readonly defaultBufferSize = 8192;

  #state: DecoderState = DecoderState.header;
  #nBytes = 0;
  #nFrameBytesTotal = 0;
  readonly #headerData: DockerFrameHeader = {
    type: "stdout",
    frameLength: 0,
  };
  readonly #buffer: Uint8Array;

  get bufferLength(): number {
    return this.#buffer.length;
  }

  constructor(bufferLength = DockerDecoder.defaultBufferSize) {
    super();
    if (!Number.isInteger(bufferLength)) {
      throw new TypeError("Buffer length must be an integer");
    }
    if (bufferLength <= 0) {
      throw new RangeError("Buffer length cannot be <= 0");
    }
    this.#buffer = new Uint8Array(bufferLength);
  }

  push(chunk: Uint8Array): void {
    try {
      while (chunk.length) {
        const length = chunk.length;
        if (this.#state === DecoderState.header) {
          const bytesToRead = Math.min(HEADER_LENGTH - this.#nBytes, chunk.length);
          assert(bytesToRead > 0, "Error during header chunk processing");
          this.#buffer.set(chunk.subarray(0, bytesToRead), this.#nBytes);
          chunk = chunk.subarray(bytesToRead);
          this.#nBytes += bytesToRead;
          if (this.#nBytes >= HEADER_LENGTH) {
            this.#headerData.type = parseDockerFrameType(this.#buffer);
            this.#headerData.frameLength = parseDockerFrameLength(this.#buffer);
            this.#nBytes = 0;
            if (this.#headerData.frameLength) {
              this.#state = DecoderState.payload;
            }
          }
        }
        if (this.#state === DecoderState.payload && chunk.length) {
          const bytesToRead = Math.min(
            this.#headerData.frameLength - this.#nBytes,
            this.#buffer.length - this.#nBytes,
            chunk.length
          );
          assert(bytesToRead > 0, `DockerStreamDecoder have some data to read (${bytesToRead} > 0)`);
          assert(this.#nBytes < this.#buffer.length, `Buffer has enough space to acommodate the data (${this.#nBytes} < ${this.#buffer.length})`);
          this.#buffer.set(chunk.subarray(0, bytesToRead), this.#nBytes);
          chunk = chunk.subarray(bytesToRead);
          this.#nBytes += bytesToRead;
          this.#nFrameBytesTotal += bytesToRead;
          const frameCompleted = this.#nFrameBytesTotal >= this.#headerData.frameLength;
          if (frameCompleted || this.#nBytes >= this.#buffer.length) {
            const data: DockerStreamFrame = {
              type: this.#headerData.type,
              payload: this.#buffer.subarray(0, this.#nBytes),
            };
            if (frameCompleted) {
              this.#state = DecoderState.header;
              this.#nFrameBytesTotal = 0;
            }
            this.#nBytes = 0;
            this.emit("data", data);
          }
        }
        assert(length > chunk.length, `Data processed during DockerStreamDecoder iteration (${length} > ${chunk.length})`);
      }
    } catch (e) {
      this.emit("error", e);
    }
  }

  close() {
    this.emit("end", this.#state === DecoderState.payload ? {
      type: this.#headerData.type,
      payload: this.#buffer.subarray(0, this.#nBytes)
    } : undefined);
  }
}

interface DockerFrameHeader {
  type: "stdin" | "stdout" | "stderr",
  frameLength: number;
}