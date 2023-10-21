# Docker Logs Stream decoder

Fast and efficient and JS decoder for Docker log streams using 
[Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API). 
Supports bring-your-own-buffer zero memmory allocation data copying between streams.

Can work in a browser or on the backend.
Streams API is supported on node 18+, bare-minimum eventemitter version can work in node 16.
[Can I use Streams API?](https://caniuse.com/mdn-api_writablestream)

8KiB minified. 
Its only runtime dependency is [eventemitter3](https://github.com/primus/eventemitter3) to have isomorphic interface in node and browser.

## Installation

```sh
npm install docker-decoder-stream
```

## Usage

### Stream usage

```ts
import { DockerDecoderStream } from "docker-decoder-stream";

const response = await fetch("/v1.43/containers/{id}/logs?follow=true");
if (!response.body) {
  throw new Error();
}
const reader = response.body
  .pipeThrough(new DockerDecoderStream()) // By default reading "stdout"
  .pipeThrough(new TextDecoderStream())
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
`mixDownReaders` combines output of multiple readers. If several readers are ready simultaneously, then
it randomly picks one of their values, so we can fairly access their data, without one stream dominating
over the other. 

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
      // You need to immediately syncroneously process the payload, otherwise it will be overwritten by the 
      // next chunk of data. If you need to process the data in async fashion, you must copy the payload
      // @example const data = payload.slice();
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

## Rendering considerations

During the initial load or if you have a large throughput in docker logs, you can easily overwhelm
the browser with a huge number of rerenders, making the page unresponsive.

To avoid that, tie the content updates to `requestAnimationFrame`, accumulating them in a buffer
and applying them all at once at the current framerate.

If you're using a reactive framework (and you most likely do), then it might be a good idea to omit reactivity 
tools it provides and just to update target element's [textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent) if you're rendering plain text logs, to decrease cost of an update even further. 

See the provided [examples](./examples/) with implementation of such a buffer.

## Contributing
If you have any ideas or suggestions or want to report a bug, feel free to
write in the issues section or create a PR.

## License
`docker-decoder-stream` is MIT licensed.