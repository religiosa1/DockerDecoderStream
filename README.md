# Docker Logs Stream decoder

Efficient JS decoder for Docker log streams. Can work in a browser or on the backend.
[Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) is supported on node 18+, 
absolute minimum version is node 12+, as this library uses [private class features](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_class_fields);

It's only runtime dependency is [eventemitter3](https://github.com/primus/eventemitter3) to have isomorphic interface in node and browser.

<!-- ## Installation

```sh
npm install docker-decoder-stream
``` -->

## Usage

### Stream usage

```ts
import { DockerDecoderStream } from "docker-decoder-stream";

const response = await fetch("/v1.43/containers/{id}/logs?follow=true");
if (!response.body) {
  throw new Error();
}
const reader = response.body
  .pipeThrough(new DockerDecoderStream())
  .pipeThrough(new TextDecoderStream()) // By default reading "stdout".
  .getReader();

for (; ;) {
  const { value, done } = await reader.read();
  if (value !== undefined) {
    // Do something with your text value
  }
  if (done) { break; }
}

// you can specify the stream you're interested in in constructor:
const stderrStream = new DockerDecoderStream("stderr");
```

Some bright day we will be able to do:
```ts
for await (const chunk of stream) {}
```
But for now this is blocked in chrome: https://bugs.chromium.org/p/chromium/issues/detail?id=929585

### Multiplexed streams usage

```ts
const dockerStreamDecoder = new DockerDecoderStream();
response.body?.pipeTo(dockerStreamDecoder.writable);
const stdoutReader = dockerStreamDecoder.stdout.pipeThrough(new TextDecoderStream("utf-8")).getReader();
const stderrReader = dockerStreamDecoder.stderr.pipeThrough(new TextDecoderStream("utf-8")).getReader();

for (; ;) {
  const { value, done } = await Promise.race([ 
    stdoutReader.read(), 
    stderrReader.read(),
  ]);
  if (value !== undefined) {
    // Do something with your text value
  }
  if (done) { break; }
}
```

### Sync/no-stream usage
```ts
import { DockerDecoder } from "docker-decoder-stream";

const dockerLogBlob = await fetch("/v1.43/containers/{id}/logs")
  .then(response => response.blob());

const data = new DockerDecoder().decode(dockerLogBlob);
const text = new TextDecoder().decode(data);
```

### Barebone eventemitter usage (when ReadableStream isn't supproted: old node or custom use-cases)

```ts
import { DockerDecoder } from "docker-decoder-stream";

const decoder = new DockerDecoder();
const stdoutDecoder = new TextDecoder("utf-8");
const stderrDecoder = new TextDecoder("utf-8");

const controller = new AbortController();

decoder
  .on("data", (type, payload) => {
    // Do something with the Uint8Array content here
    if (type === "stdout") {
      const text = stdoutDecoder.decode(payload, { stream: true });
    }
    // Use separate decoders to prevent corruption of Unicode chars when they're spread across multiple chunks!
    if (type === "stderr") {
      const text = stderrDecoder.decode(payload, { stream: true });
    }
  })
  .on("end", (type, payload) => {
    // Decoder may produce a partially read frame, if it was aborted in the middle of the stream's body
    if (type === "stdout") {
      const text = stdoutDecoder.decode(payload, { stream: false });
    }
  })
  .on("error", (err) => { controller.abort(err) });

const response = await fetch("/v1.43/containers/{id}/logs?follow=true", { signal: controller.signal });
const reader = response.body.getReader();

for (; ;) {
  const { value, done } = await reader.read();
  if (value !== undefined) {
    decoder.push(value);
  }
  if (done) { break; }
}
// finally:
decoder.close();
```

