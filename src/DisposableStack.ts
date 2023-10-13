export class DisposableStack {
  #disposers: Array<[value: any, disposer: (value: any) => unknown]> = []

  adopt<T>(value: T, disposer: (value: T) => unknown): T {
    this.#disposers.push([value, disposer]);
    return value;
  }

  defer(cb: () => unknown) {
    this.#disposers.push([undefined, cb]);
  }

  dispose() {
    while (this.#disposers.length) {
      const [value, disposer] = this.#disposers.pop() ?? [];
      if (typeof disposer !== "function") {
        continue;
      }
      disposer(value);
    }
  }
}