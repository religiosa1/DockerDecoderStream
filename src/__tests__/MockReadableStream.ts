import { isOldNode } from "./isOldNode";

export const MockReadeableStream = isOldNode()
  ? class { constructor() { } } as unknown as ReadableStream<string> & {
    new(...data: string[]): ReadableStream<string>
  }
  : class MockReadeableStream extends ReadableStream<string> {
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