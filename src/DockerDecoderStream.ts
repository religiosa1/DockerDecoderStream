import { DisposableStack } from "./DisposableStack";
import { DockerDecoder } from "./DockerDecoder";

export class DockerDecoderStream {
  #decoder = new DockerDecoder();

  constructor(public defaultStreamType: "stdin" | "stdout" | "stderr" = "stderr") { }

  get readable(): ReadableStream<Uint8Array> {
    switch (this.defaultStreamType) {
      case "stdin":
        return this.stdin;
      case "stdout":
        return this.stdout;
      case "stderr":
        return this.stderr;
      default:
        throw new TypeError("Incorrect stream type");
    }
  }

  #writable: WritableStream<Uint8Array> | undefined;
  get writable(): WritableStream<Uint8Array> {
    this.#writable ??= this.#createWritableStream();
    return this.#writable;
  }

  #stdin: ReadableStream<Uint8Array> | undefined;
  get stdin(): ReadableStream<Uint8Array> {
    this.#stdin ??= this.#createReadableStream("stdin");
    return this.#stdin;
  }

  #stdout: ReadableStream<Uint8Array> | undefined;
  get stdout(): ReadableStream<Uint8Array> {
    this.#stdout ??= this.#createReadableStream("stdout");
    return this.#stdout;
  }

  #stderr: ReadableStream<Uint8Array> | undefined;
  get stderr(): ReadableStream<Uint8Array> {
    this.#stderr ??= this.#createReadableStream("stderr");
    return this.#stderr;
  }

  // General info on byte streams in js
  // https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_byte_streams

  /** @see https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_writable_streams */
  #createWritableStream(): WritableStream<Uint8Array> {
    const stack = new DisposableStack();
    return new WritableStream({
      start: (controller) => {
        this.#decoder.on("error", stack.adopt(
          (err) => { controller.error(err) },
          (handler) => { this.#decoder.off("error", handler) }
        ));
      },
      write: (chunk) => {
        this.#decoder.push(chunk);
      },
      close: () => {
        this.#decoder.close();
        stack.dispose();
      },
      abort: () => {
        this.#decoder.close();
        stack.dispose();
      },
    });
  }

  /** @see https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams#creating_your_own_custom_readable_stream */
  #createReadableStream(type: "stdin" | "stdout" | "stderr"): ReadableStream<Uint8Array> {
    const stack = new DisposableStack();
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#decoder.on("data", stack.adopt(
          (frameType, payload) => {
            if (frameType !== type) { return }
            const view = isReadableByteStreamController(controller) && controller.byobRequest?.view;

            if (view && view.byteLength && view.byteLength - view.byteOffset >= payload.length) {
              const { length } = payload;
              new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(payload);
              controller.byobRequest.respond(length);
            } else {
              controller.enqueue(payload);
            }
          },
          (handler) => this.#decoder.off("data", handler),
        ));
        this.#decoder.on("error", stack.adopt(
          (err) => { controller.error(err) },
          (handler) => this.#decoder.off("error", handler)
        ));
      },
      cancel() {
        stack.dispose();
      },
      type: "bytes",
      autoAllocateChunkSize: this.#decoder.bufferLength,
    });
  }
}

function isReadableByteStreamController(
  ctrlr: ReadableStreamController<Uint8Array>
): ctrlr is ReadableByteStreamController {
  return ("byobRequest" in ctrlr);
}
