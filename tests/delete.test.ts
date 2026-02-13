import { describe, it, expect, vi } from "vitest";
import { createStore } from "../src/index";

describe("Delete operations", () => {
  it("should notify subscribers when a property is deleted", () => {
    type MyStore = { a?: number; b?: number };
    const store = createStore<MyStore>({ a: 1, b: 2 });

    const callback = vi.fn();
    store.subscribe((root) => root.a, callback);

    callback.mockClear();
    delete store.root.a;

    expect(callback).toHaveBeenCalledWith(undefined);
    expect(store.root.a).toBeUndefined();
  });

  it("should notify subscribers when a nested property is deleted", () => {
    type MyStore = { obj: { x?: number; y?: number } };
    const store = createStore<MyStore>({ obj: { x: 1, y: 2 } });

    const callback = vi.fn();
    store.subscribe((root) => root.obj.x, callback);

    callback.mockClear();
    delete store.root.obj.x;

    expect(callback).toHaveBeenCalledWith(undefined);
  });

  it("should emit change events on delete", () => {
    type MyStore = { a?: number };
    const store = createStore<MyStore>({ a: 1 });

    const callback = vi.fn();
    store.subscribeToChanges(callback);

    delete store.root.a;

    expect(callback).toHaveBeenCalledWith([
      { type: "property", path: "a", value: undefined },
    ]);
  });

  it("should not notify when deleting a non-existent property", () => {
    type MyStore = { a?: number };
    const store = createStore<MyStore>({});

    const callback = vi.fn();
    store.subscribe((root) => root.a, callback);

    callback.mockClear();
    delete store.root.a;

    expect(callback).not.toHaveBeenCalled();
  });

  it("should batch delete in apply()", () => {
    type MyStore = { a?: number; b?: number };
    const store = createStore<MyStore>({ a: 1, b: 2 });

    const callback = vi.fn();
    store.subscribe((root) => [root.a, root.b], callback);

    callback.mockClear();
    store.apply((root) => {
      delete root.a;
      delete root.b;
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith([undefined, undefined]);
  });

  it("should rollback delete on subscriber error", () => {
    type MyStore = { a?: number };
    const store = createStore<MyStore>({ a: 42 });

    store.subscribeToChanges(() => {
      throw new Error("fail");
    });

    expect(() => delete store.root.a).toThrow("fail");
    expect(store.root.a).toBe(42);
  });
});
