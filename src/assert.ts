export function assert<T>(e: T, message?: string): asserts e is NonNullable<T> {
  if (!e) {
    throw new AssertionError(message);
  }
}

export class AssertionError extends Error {
  override name = "AssertionError";
}