import { IOStreamType } from "../DockerDecoder"
import { concatUint8Arrays } from "../concatUint8Arrays";
import { isReadableByteStreamController } from "../isReadableByteStreamController";
import { createDockerFrame } from "./createDockerFrame";

type DockerFrame = [type: IOStreamType, payload: ArrayLike<number>];
export class DockerReadableStreamMock extends ReadableStream<Uint8Array> {
  private readonly payload: Uint8Array;
  private pos = 0;

  constructor(frames: DockerFrame[]) {
    super({
      pull: (controller) => {
        try {
          if (!isReadableByteStreamController(controller) || !controller.byobRequest) {
            const bytesLeft = this.payload.length - this.pos;
            const bytesToWrite = controller.desiredSize
              ? Math.min(controller.desiredSize, bytesLeft)
              : bytesLeft;
            controller.enqueue(this.payload.subarray(this.pos, this.pos + bytesToWrite));
            this.pos += bytesToWrite;
            return;
          }
          const { byobRequest } = controller;
          if (byobRequest.view?.buffer) {
            const { view } = byobRequest;
            const bytesToWrite = Math.min(view.byteLength - view.byteOffset, this.payload.length - this.pos);
            new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
              .set(this.payload.subarray(this.pos, this.pos + bytesToWrite));
            this.pos += bytesToWrite;
            byobRequest.respond(bytesToWrite);
            return;
          }
          byobRequest.respondWithNewView(this.payload.subarray(this.pos));
          this.pos += this.payload.length;
          return;

        } catch (err) {
          controller.error(err);
        } finally {
          if (this.pos >= this.payload.length) {
            controller.close();
          }
        }
      },
      type: "bytes",
    });

    this.payload = concatUint8Arrays(
      frames
        .map((frame) => createDockerFrame(...frame))
    );
  }
}