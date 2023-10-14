# Docker Logs Stream decoder

Fast and efficient and JS decoder for Docker log streams using 
[Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API). 
Supports bring-your-own-buffer zero memmory allocation data copying between streams.

Can work in a browser or on the backend.
Streams API is supported on node 18+, bare-minimum eventemitter version can work in node 12.
[Can I use Streams API?](https://caniuse.com/mdn-api_writablestream)

8KiB minified. 
Its only runtime dependency is [eventemitter3](https://github.com/primus/eventemitter3) to have isomorphic interface in node and browser.

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
  .pipeThrough(new TextDecoderStream()) // By default reading "stdout"
  .getReader();

for (; ;) {
  const { value, done } = await reader.read();
  if (value !== undefined) {
    // Do something with your text value
  }
  if (done) { break; }
}

// you can specify the stream you're interested in in constructor:
const stderrStream = new DockerDecoderStream("stdin");
```

Some bright day we will be able to do:
```ts
for await (const chunk of stream) {}
```
But for now this is blocked in chrome: https://bugs.chromium.org/p/chromium/issues/detail?id=929585

### Multiplexed streams usage

```ts
import { DockerDecoderStream, mixDownReaders } from "docker-decoder-stream";

const response = await fetch("/v1.43/containers/{id}/logs?follow=true");
if (!response.body) {
  throw new Error();
}
const dockerStreamDecoder = new DockerDecoderStream();
// specific IO streams from docker are available as getters on DockerDecoderStream
const stdout = dockerStreamDecoder.stdout.pipeThrough(new TextDecoderStream("utf-8")).getReader();
const stderr = dockerStreamDecoder.stderr.pipeThrough(new TextDecoderStream("utf-8")).getReader();
response.body?.pipeTo(dockerStreamDecoder.writable);

// mixDownReaders helper provides an async iterator to get all of the chunks from multiple ReadableStreams
for await (const [type, value] of mixDownReaders({ stdout, stderr })) {
  if (type === "stdout") {
    console.log("here's your stdout value", value);
  }
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

### Barebone eventemitter usage (when ReadableStream isn't availabe: old node or custom use-cases)

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

