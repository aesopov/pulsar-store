import { describe, it, expect, vi } from "vitest";
import { createStore } from "../src/index";
import type { Change, ArrayChange } from "../src/index";

describe("subscribeToChanges", () => {
  it("should capture property changes", () => {
    type Store = { user: { name: string; age: number } };
    const store = createStore<Store>({ user: { name: "Alice", age: 30 } });
    const changes: Change[] = [];

    store.subscribeToChanges((c) => changes.push(...c));

    store.root.user.name = "Bob";

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      type: "property",
      path: "user.name",
      value: "Bob",
    });
  });

  it("should capture array changes", () => {
    type Store = { items: string[] };
    const store = createStore<Store>({ items: ["a"] });
    const changes: Change[] = [];

    store.subscribeToChanges((c) => changes.push(...c));

    store.root.items.push("b");

    expect(changes).toHaveLength(1);
    const change = changes[0] as ArrayChange;
    expect(change.type).toBe("array");
    expect(change.path).toBe("items");
    expect(change.method).toBe("push");
    expect(change.args).toEqual(["b"]);
  });

  it("should batch changes in transactions", () => {
    type Store = { a: number; b: number };
    const store = createStore<Store>({ a: 1, b: 2 });
    const changeBatches: Change[][] = [];

    store.subscribeToChanges((c) => changeBatches.push([...c]));

    store.apply((root) => {
      root.a = 10;
      root.b = 20;
    });

    expect(changeBatches).toHaveLength(1);
    expect(changeBatches[0]).toHaveLength(2);
  });

  it("should return unsubscribe function", () => {
    type Store = { x: number };
    const store = createStore<Store>({ x: 1 });
    const callback = vi.fn();

    const unsubscribe = store.subscribeToChanges(callback);
    unsubscribe();

    store.root.x = 10;

    expect(callback).not.toHaveBeenCalled();
  });
});
