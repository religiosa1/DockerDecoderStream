import { useState, useEffect, type ReactElement } from "react";
import { DockerDecoderStream, mixDownReaders } from "docker-decoder-stream";

interface Props {
  response: Response | undefined;
}
export function LoggerViewer({ response }: Props): ReactElement {
  const [bufferedUpdater] = useState(() => new BufferedUpdater());

  useEffect(() => {
    process().catch(console.error);
    const controller = new AbortController();
    async function process() {
      if (!response || !response.body) {
        return;
      }
      const decoder = new DockerDecoderStream();
      const stdout = decoder.stdout
        .pipeThrough(new TextDecoderStream("utf-8"))
        .getReader();
      const stderr = decoder.stderr
        .pipeThrough(new TextDecoderStream("utf-8"))
        .getReader();
      response.body.pipeTo(decoder.writable);
      controller.signal.addEventListener("abort", () => {
        decoder.writable.abort()
      });

      const mixdown = mixDownReaders({ stdout, stderr });
      for await (const [type, value] of mixdown) {
        bufferedUpdater.append(type + ": " + value);
      }
    }
    return () => { controller.abort() }
  }, [response]);

  return (
    <output ref=(bufferedUpdater.setRef) />
  );
}

class BufferedUpdater {
  #element?: HTMLElement;
  #updateQueue: string[] = [];

  constructor(public maxLength = 80_000) {
    // binding the action method, so svelte's action won't tear away our this
    this.setRef = this.setRef.bind(this);
  }

  append(text: string): void {
    this.#updateQueue.push(text);
    // No need to requestAnimationFrame if we already had something in the queue -- it's been called earlier
    if (this.#updateQueue.length <= 1) {
      requestAnimationFrame(() => this.#applyQueue());
    }
  }

  setRef(element: HTMLElement) {
    this.#element = element;
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