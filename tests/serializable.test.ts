import { describe, it, expect } from "vitest";
import { createStore } from "../src/index";

describe("Non-serializable value rejection", () => {
  it("should reject Map in initial value", () => {
    expect(() => {
      createStore<any>({ data: new Map() });
    }).toThrow(/Non-serializable value of type "Map"/);
  });

  it("should reject Set in initial value", () => {
    expect(() => {
      createStore<any>({ data: new Set() });
    }).toThrow(/Non-serializable value of type "Set"/);
  });

  it("should reject Date in initial value", () => {
    expect(() => {
      createStore<any>({ date: new Date() });
    }).toThrow(/Non-serializable value of type "Date"/);
  });

  it("should reject RegExp in initial value", () => {
    expect(() => {
      createStore<any>({ pattern: /abc/ });
    }).toThrow(/Non-serializable value of type "RegExp"/);
  });

  it("should reject Promise in initial value", () => {
    expect(() => {
      createStore<any>({ promise: Promise.resolve(1) });
    }).toThrow(/Non-serializable value of type "Promise"/);
  });

  it("should reject Function in initial value", () => {
    expect(() => {
      createStore<any>({ fn: () => {} });
    }).toThrow(/Non-serializable value of type "Function"/);
  });

  it("should reject WeakMap in initial value", () => {
    expect(() => {
      createStore<any>({ data: new WeakMap() });
    }).toThrow(/Non-serializable value of type "WeakMap"/);
  });

  it("should reject WeakSet in initial value", () => {
    expect(() => {
      createStore<any>({ data: new WeakSet() });
    }).toThrow(/Non-serializable value of type "WeakSet"/);
  });

  it("should reject deeply nested non-serializable values", () => {
    expect(() => {
      createStore<any>({ a: { b: { c: new Map() } } });
    }).toThrow(/Non-serializable value of type "Map" at path "root.a.b.c"/);
  });

  it("should reject non-serializable values inside arrays", () => {
    expect(() => {
      createStore<any>({ items: [1, 2, new Set()] });
    }).toThrow(/Non-serializable value of type "Set" at path "root.items.2"/);
  });

  it("should reject Map assigned via root proxy", () => {
    const store = createStore<any>();
    expect(() => {
      store.root.data = new Map();
    }).toThrow(/Non-serializable value of type "Map"/);
  });

  it("should reject Set assigned to nested property", () => {
    const store = createStore<any>({ a: { b: 1 } });
    expect(() => {
      store.root.a.b = new Set();
    }).toThrow(/Non-serializable value of type "Set"/);
  });

  it("should reject non-serializable objects assigned as nested objects", () => {
    const store = createStore<any>();
    expect(() => {
      store.root.data = { nested: new Date() };
    }).toThrow(/Non-serializable value of type "Date"/);
  });

  it("should reject non-serializable values pushed to arrays", () => {
    const store = createStore<any>({ items: [1, 2, 3] });
    expect(() => {
      store.root.items.push(new Map());
    }).toThrow(/Non-serializable value of type "Map"/);
  });

  it("should reject non-serializable values in array unshift", () => {
    const store = createStore<any>({ items: [1] });
    expect(() => {
      store.root.items.unshift(new Set());
    }).toThrow(/Non-serializable value of type "Set"/);
  });

  it("should reject non-serializable values in array splice", () => {
    const store = createStore<any>({ items: [1, 2, 3] });
    expect(() => {
      store.root.items.splice(1, 0, new Map());
    }).toThrow(/Non-serializable value of type "Map"/);
  });

  it("should reject non-serializable values via apply()", () => {
    const store = createStore<any>({ data: null });
    expect(() => {
      store.apply((root) => {
        root.data = new Map();
      });
    }).toThrow(/Non-serializable value of type "Map"/);
  });

  it("should reject non-serializable values via applyChanges()", () => {
    const store = createStore<any>({ data: null });
    expect(() => {
      store.applyChanges([{ type: "property", path: "data", value: new Set() }]);
    }).toThrow(/Non-serializable value of type "Set"/);
  });

  it("should allow plain objects, arrays, and primitives", () => {
    expect(() => {
      createStore<any>({
        str: "hello",
        num: 42,
        bool: true,
        nil: null,
        undef: undefined,
        arr: [1, "two", false, null, [3, 4]],
        nested: { a: { b: { c: "deep" } } },
      });
    }).not.toThrow();
  });

  it("should allow setting plain values via proxy", () => {
    const store = createStore<any>();
    expect(() => {
      store.root.str = "hello";
      store.root.num = 42;
      store.root.obj = { a: 1 };
      store.root.arr = [1, 2, 3];
    }).not.toThrow();
  });
});
