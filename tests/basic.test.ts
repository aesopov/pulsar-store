import { describe, it, expect } from "vitest";
import { createStore } from "../src/index";

describe("Basic read/write", () => {
  it("should read and write nested properties", () => {
    type MyStore = { a: { b: { x: number; y: number } } };
    const store = createStore<MyStore>();

    store.root.a = { b: { x: 1, y: 2 } };

    expect(store.root.a.b.x).toBe(1);
    expect(store.root.a.b.y).toBe(2);
  });

  it("should update nested properties", () => {
    type MyStore = { a: { b: { x: number } } };
    const store = createStore<MyStore>({ a: { b: { x: 1 } } });

    store.root.a.b.x = 10;

    expect(store.root.a.b.x).toBe(10);
  });

  it("should return the same proxy instance for the same object", () => {
    type MyStore = { a: number[]; b: { x: number } };
    const store = createStore<MyStore>({ a: [1, 2, 3], b: { x: 1 } });

    const t1 = store.root.a;
    const t2 = store.root.a;
    expect(t1).toBe(t2);

    const o1 = store.root.b;
    const o2 = store.root.b;
    expect(o1).toBe(o2);
  });

  it("should return a new proxy after the object is replaced", () => {
    type MyStore = { a: { x: number } };
    const store = createStore<MyStore>({ a: { x: 1 } });

    const before = store.root.a;
    store.root.a = { x: 2 };
    const after = store.root.a;

    expect(before).not.toBe(after);
  });
});
