# Docker Logs Stream decoder

Efficient JS decoder for Docker log streams. Can work in a browser or on the backend.
[Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) is supported on node 18+, 
absolute minimum version is node 12+, as this library uses [private class features](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_class_fields);

It's only runtime dependency is [eventemitter3](https://github.com/primus/eventemitter3) to have isomorphic interface in node and browser.

<!-- ## Installation

```sh
npm install docker-stream-decoder
``` -->

## Usage

### Stream usage

```ts
const response = await fetch("/v1.43/containers/{id}/logs?follow=true");
if (!response.body) {
  throw new Error();
}
const reader = response.body
  .pipeThrough(new DockerStreamDecoder())
  .pipeThrough(new TextDecoderStream())
  .getReader();

for (; ;) {
  const { value, done } = await reader.read();
  if (value !== undefined) {
    // Do something with your text value
  }
  if (done) { break; }
}

```

Some bright day we will be able to do:
```ts
for await (const chunk of stream) {}
```
But for now this is blocked in chrome: https://bugs.chromium.org/p/chromium/issues/detail?id=929585

### Multiplexed streams usage

```ts
const response = await fetch("/v1.43/containers/{id}/logs?follow=true");
if (!response.body) {
  throw new Error();
}
const dockerStreamDecoder = new DockerStreamDecoder();

response.body?.pipeTo(dockerStreamDecoder.writable)
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

### Barebone usage (old node or custom use-cases)

```ts
import { DockerLogsDecoder } from "docker-logs-decoder";

const decoder = new DockerLogDecoder();
const stdoutDecoder = new TextDecoder("utf-8");
const stderrDecoder = new TextDecoder("utf-8");

const controller = new AbortController();

decoder
  .on("data", (frame) => {
    // Do something with the Uint8Array content here
    if (frame.type === "stdout") {
      const text = stdoutDecoder.decode(frame.payload, { stream: true });
    }
    // Use separate decoders, as you can get mangled unicode chars, if they're spread between the chunks!
    if (frame.type === "stderr") {
      const text = stderrDecoder.decode(frame.payload, { stream: true });
    }
  })
  .on("end", (frame) => {
    // Decoder can give partially read frame, if it was aborted in the middle of the stream's body
    if (frame?.type === "stdout") {
      const text = stdoutDecoder.decode(frame.payload, { stream: false });
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

