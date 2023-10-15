export class DisposableStack {
  #disposers: Array<[value: any, disposer: (value: any) => unknown]> = []

  adopt<T>(value: T, disposer: (value: T) => unknown): T {
    if (typeof disposer !== "function") {
      throw TypeError();
    }
    this.#disposers.push([value, disposer]);
    return value;
  }

  defer(cb: () => unknown) {
    if (typeof cb !== "function") {
      throw TypeError();
    }
    this.#disposers.push([undefined, cb]);
  }

  dispose() {
    while (this.#disposers.length) {
      const [value, disposer] = this.#disposers.pop()!;
      disposer!(value);
    }
  }
}