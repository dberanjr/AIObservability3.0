import { describe, expect, it, vi } from "vitest";
import { createResetHandlerRegistry } from "./resetHandlerRegistry";

describe("createResetHandlerRegistry", () => {
  it("runs every registered handler on run()", () => {
    const reg = createResetHandlerRegistry();
    const a = vi.fn();
    const b = vi.fn();
    reg.register(a);
    reg.register(b);

    reg.run();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("stops calling a handler once it is unregistered", () => {
    const reg = createResetHandlerRegistry();
    const a = vi.fn();
    const unregister = reg.register(a);

    reg.run();
    expect(a).toHaveBeenCalledTimes(1);

    unregister();
    reg.run();
    expect(a).toHaveBeenCalledTimes(1); // not called again
  });

  it("is a no-op when there are no handlers", () => {
    const reg = createResetHandlerRegistry();
    expect(() => reg.run()).not.toThrow();
  });
});
