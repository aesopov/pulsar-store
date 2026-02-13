import { describe, it, expect, vi } from "vitest";
import { createStore } from "../src/index";

describe("subscribe", () => {
  type MyStore = { a: { b: { x: number; y: number } } };

  it("should call callback with initial value", () => {
    const store = createStore<MyStore>({ a: { b: { x: 1, y: 2 } } });
    const callback = vi.fn();

    store.subscribe((root) => root.a.b.x + root.a.b.y, callback);

    expect(callback).toHaveBeenCalledWith(3);
  });

  it("should call callback when tracked property changes", () => {
    const store = createStore<MyStore>({ a: { b: { x: 1, y: 2 } } });
    const callback = vi.fn();

    store.subscribe((root) => root.a.b.x + root.a.b.y, callback);
    callback.mockClear();

    store.root.a.b.x = 10;

    expect(callback).toHaveBeenCalledWith(12);
  });

  it("should not call callback when unrelated property changes", () => {
    type Store = { a: number; b: number };
    const store = createStore<Store>({ a: 1, b: 2 });
    const callback = vi.fn();

    store.subscribe((root) => root.a, callback);
    callback.mockClear();

    store.root.b = 10;

    expect(callback).not.toHaveBeenCalled();
  });

  it("should return unsubscribe function", () => {
    const store = createStore<MyStore>({ a: { b: { x: 1, y: 2 } } });
    const callback = vi.fn();

    const unsubscribe = store.subscribe((root) => root.a.b.x, callback);
    callback.mockClear();

    unsubscribe();
    store.root.a.b.x = 10;

    expect(callback).not.toHaveBeenCalled();
  });

  it("should trigger when parent object changes", () => {
    const store = createStore<MyStore>({ a: { b: { x: 1, y: 2 } } });
    const callback = vi.fn();

    store.subscribe((root) => root.a.b.x + root.a.b.y, callback);
    callback.mockClear();

    store.root.a.b = { x: 5, y: 6 };

    expect(callback).toHaveBeenCalledWith(11);
  });

  it("should work with object subscriptions", () => {
    const store = createStore<MyStore>({ a: { b: { x: 1, y: 2 } } });
    const callback = vi.fn();

    store.subscribe((root) => root.a.b, callback);
    callback.mockClear();

    store.root.a.b.x = 10;

    expect(callback).toHaveBeenCalled();
  });
});
