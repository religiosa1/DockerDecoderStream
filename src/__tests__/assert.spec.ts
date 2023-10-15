import { AssertionError, assert } from "../assert";

describe("assert", () => {
  it("throws an error if condition is falsy", () => {
    expect(() => assert(0)).toThrow();
  });

  it("doesn't throw if condition is truthy", () => {
    expect(() => assert(1)).not.toThrow();
  });

  it("asserts value is not nulish", () => {
    let a: string | null | undefined;
    let b: string | null | undefined;
    expect(() => {
      assert(a)
      a.charAt(1);
      //@ts-expect-error should has 'possibly null or undefined', because it hasn't been asserted
      b.charAt(1)
    }).toThrow();
  });

  it("throws AssertionError", () => {
    expect(() => assert(null)).toThrow(AssertionError);
  });

  it("throws AssertionError with provided message", () => {
    expect(() => assert(null, "test")).toThrow(AssertionError);
    expect(() => assert(null, "test")).toThrow("test");
  });
});