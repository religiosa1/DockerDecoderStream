export function isReadableByteStreamController(
  ctrlr: ReadableStreamController<Uint8Array>
): ctrlr is ReadableByteStreamController {
  return ("byobRequest" in ctrlr);
}
