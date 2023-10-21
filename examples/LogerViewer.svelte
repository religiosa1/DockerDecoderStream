<script lang="ts">
  import { BufferedUpdater } from "./BufferedUpdater.svelte";
  import { DockerDecoderStream, mixDownReaders } from "docker-decoder-stream";
  import { onMount } from "svelte";

  export let response: Response | undefined;

  let logViewer: HTMLElement | undefined;

  const bufferedUpdater = new ThrottledUpdater(logViewer);

  onMount(async () => {
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

    const mixdown = mixDownReaders({ stdout, stderr });
    for await (const [type, value] of mixdown) {
      if (!logViewer) {
        continue;
      }
      bufferedUpdater.append(type + ": " + value);
    }
  });
</script>

<output bind:this={logViewer} use:bufferedUpdater.action />

<style>
  output {
    display: block;
    font-family: monospace;
    white-space: pre;
    overflow: auto;
  }
</style>
