import { DisposableStack } from "./DisposableStack";
import { DockerDecoder, IOStreamType } from "./DockerDecoder";
import { isReadableByteStreamController } from "./isReadableByteStreamController";

export class DockerDecoderStream {
  #decoder = new DockerDecoder();

  constructor(public defaultStreamType: "stdin" | "stdout" | "stderr" = "stdout") { }

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
        this.#decoder
          .on("data", stack.adopt(enqueue, () => this.#decoder.off("data", enqueue)))
          .on("end", stack.adopt((type, frame) => {
            enqueue(type, frame);
            controller.close();
            stack.dispose();
          }, (handler) => this.#decoder.off("end", handler)))
          .on("error", stack.adopt(
            (err) => { controller.error(err) },
            (handler) => this.#decoder.off("error", handler)
          ));
        function enqueue(frameType?: IOStreamType, payload?: Uint8Array) {
          if (frameType !== type || !payload) { return }
          if (!isReadableByteStreamController(controller) || !controller.byobRequest) {
            return controller.enqueue(payload.slice());
          }
          const { view } = controller.byobRequest;
          if (!view || view.byteLength - view.byteOffset < payload.length) {
            return controller.byobRequest.respondWithNewView(payload);
          }
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(payload);
          controller.byobRequest.respond(payload.length);
        }
      },
      cancel() {
        stack.dispose();
      },
      type: "bytes",
      autoAllocateChunkSize: this.#decoder.bufferLength,
    });
  }
}

