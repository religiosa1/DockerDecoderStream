export class BufferedUpdater {
  #element?: HTMLElement;
  #updateQueue: string[] = [];

  constructor(public maxLength = 80_000) {
    // binding the action method, so svelte's action won't tear away our this
    this.action = this.action.bind(this);
  }

  append(text: string): void {
    this.#updateQueue.push(text);
    // No need to requestAnimationFrame if we already had something in the queue -- it's been called earlier
    if (this.#updateQueue.length <= 1) {
      requestAnimationFrame(() => this.#applyQueue());
    }
  }

  /** To tie an actual element though svelte's actions
   * @see https://svelte.dev/docs/svelte-action
   */
  action(element: HTMLElement) {
    this.#element = element;
    return {
      destroy: () => this.#element = undefined,
    }
  }

  #applyQueue(): void {
    const newValue = this.#updateQueue.join("");
    this.#updateQueue = [];
    if (this.#element) {
      const existingValue = this.#element.textContent;
      // We're never displaying more than maxLength characters, so we don't eat all of the memory with time
      const clampedContent = (existingValue + newValue).slice(-this.maxLength);
      this.#element.textContent = clampedContent;
    }
  }
}