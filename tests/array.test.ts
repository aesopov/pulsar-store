import { describe, it, expect, vi } from "vitest";
import { createStore } from "../src/index";

describe("Array tracking", () => {
  type Store = { items: string[] };

  it("should track push", () => {
    const store = createStore<Store>({ items: [] });
    const callback = vi.fn();

    store.subscribe((root) => root.items.length, callback);
    callback.mockClear();

    store.root.items.push("a");

    expect(callback).toHaveBeenCalledWith(1);
    expect(store.root.items).toEqual(["a"]);
  });

  it("should track pop", () => {
    const store = createStore<Store>({ items: ["a", "b"] });
    const callback = vi.fn();

    store.subscribe((root) => root.items.length, callback);
    callback.mockClear();

    const popped = store.root.items.pop();

    expect(callback).toHaveBeenCalledWith(1);
    expect(popped).toBe("b");
    expect(store.root.items).toEqual(["a"]);
  });

  it("should track shift", () => {
    const store = createStore<Store>({ items: ["a", "b"] });
    const callback = vi.fn();

    store.subscribe((root) => root.items.length, callback);
    callback.mockClear();

    const shifted = store.root.items.shift();

    expect(callback).toHaveBeenCalledWith(1);
    expect(shifted).toBe("a");
    expect(store.root.items).toEqual(["b"]);
  });

  it("should track unshift", () => {
    const store = createStore<Store>({ items: ["b"] });
    const callback = vi.fn();

    store.subscribe((root) => root.items.length, callback);
    callback.mockClear();

    store.root.items.unshift("a");

    expect(callback).toHaveBeenCalledWith(2);
    expect(store.root.items).toEqual(["a", "b"]);
  });

  it("should track splice", () => {
    const store = createStore<Store>({ items: ["a", "b", "c"] });
    const callback = vi.fn();

    store.subscribe((root) => root.items.join(","), callback);
    callback.mockClear();

    store.root.items.splice(1, 1, "x", "y");

    expect(callback).toHaveBeenCalledWith("a,x,y,c");
    expect(store.root.items).toEqual(["a", "x", "y", "c"]);
  });

  it("should track sort", () => {
    const store = createStore<Store>({ items: ["c", "a", "b"] });
    const callback = vi.fn();

    store.subscribe((root) => root.items.join(","), callback);
    callback.mockClear();

    store.root.items.sort();

    expect(callback).toHaveBeenCalledWith("a,b,c");
  });

  it("should track reverse", () => {
    const store = createStore<Store>({ items: ["a", "b", "c"] });
    const callback = vi.fn();

    store.subscribe((root) => root.items.join(","), callback);
    callback.mockClear();

    store.root.items.reverse();

    expect(callback).toHaveBeenCalledWith("c,b,a");
  });
});
