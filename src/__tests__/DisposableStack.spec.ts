import { DisposableStack } from "../DisposableStack";

describe("DisposableStack", () => {
  it("calls all of the provided 'defer' callbacks on dispose", () => {
    const d1 = jest.fn();
    const d2 = jest.fn();
    const disposer = new DisposableStack();
    disposer.defer(d1);
    disposer.defer(d2);
    expect(d1).not.toBeCalled();
    expect(d2).not.toBeCalled();
    disposer.dispose();
    expect(d1).toBeCalledTimes(1);
    expect(d2).toBeCalledTimes(1);
  });

  it("calls defer callback as much many times as it was supplied", () => {
    const d1 = jest.fn();
    const disposer = new DisposableStack();
    disposer.defer(d1);
    disposer.defer(d1);
    disposer.dispose();
    expect(d1).toBeCalledTimes(2);
  });

  it("returns the same value on adopt calls", () => {
    const testValue = { foo: "32167" };
    const disposer = new DisposableStack();
    const result = disposer.adopt(testValue, () => { });
    expect(result).toBe(testValue);
  });

  it("calls provided adopts callback, passing the same as the first arg", () => {
    const testValue = { foo: "32167" };
    const d1 = jest.fn();
    const disposer = new DisposableStack();
    disposer.adopt(testValue, d1);
    expect(d1).not.toBeCalled();
    disposer.dispose();
    expect(d1).toBeCalledTimes(1);
    expect(d1).toBeCalledWith(testValue);
  });

  it("calls provided adopt callback with each supplied value in lifo order", () => {
    const testValue1 = { foo: "32167" };
    const testValue2 = { bar: "32167" };
    const d1 = jest.fn();
    const disposer = new DisposableStack();
    disposer.adopt(testValue1, d1);
    disposer.defer(d1);
    disposer.adopt(testValue2, d1);
    disposer.dispose();
    expect(d1).toBeCalledTimes(3);
    expect(d1).toHaveBeenNthCalledWith(1, testValue2);
    expect(d1).toHaveBeenNthCalledWith(2, undefined);
    expect(d1).toHaveBeenNthCalledWith(3, testValue1);
  });

  it("throws TypeError if diposing callback is not a function", () => {
    const disposer = new DisposableStack();

    expect(() => {
      //@ts-expect-error should be a function
      disposer.defer("asdf");
    }).toThrow(TypeError);

    expect(() => {
      disposer.adopt(
        "asdf",
        //@ts-expect-error should be a function
        "qwer"
      );
    }).toThrow(TypeError);
  });
});