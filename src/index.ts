type PathSegment = string | symbol;
type Path = PathSegment[];

// Serializable type constraint
export type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Serializable[]
  | { [key: string]: Serializable };

const NON_SERIALIZABLE_TYPES: [abstract new (...args: never[]) => unknown, string][] = [
  [Map, "Map"],
  [Set, "Set"],
  [WeakMap, "WeakMap"],
  [WeakSet, "WeakSet"],
  [Date, "Date"],
  [RegExp, "RegExp"],
  [Promise, "Promise"],
];

function assertSerializable(value: unknown, path: string): void {
  if (value === null || value === undefined) return;

  if (typeof value === "function") {
    throw new Error(
      `Non-serializable value of type "Function" at path "${path}". ` +
        `Store only supports plain objects, arrays, and primitives.`,
    );
  }

  if (typeof value !== "object") return;

  for (const [Type, name] of NON_SERIALIZABLE_TYPES) {
    if (value instanceof Type) {
      throw new Error(
        `Non-serializable value of type "${name}" at path "${path}". ` +
          `Store only supports plain objects, arrays, and primitives.`,
      );
    }
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertSerializable(value[i], path ? `${path}.${i}` : String(i));
    }
  } else {
    for (const key of Object.keys(value as object)) {
      assertSerializable((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
    }
  }
}

// Change types for different operations
export type Change = PropertyChange | ArrayChange;

export interface PropertyChange {
  type: "property";
  path: string;
  value: unknown;
}

export interface ArrayChange {
  type: "array";
  path: string;
  method: string;
  args: unknown[];
}

interface Subscription<T, R> {
  selector: (root: T) => R;
  callback: (value: R) => void;
  paths: Set<string>;
  lastValue: R;
}

interface Store<T> {
  root: T;
  snapshot(): T;
  subscribe<R>(selector: (root: T) => R, callback: (value: R) => void): () => void;
  subscribeToChanges(callback: (changes: Change[]) => void): () => void;
  apply(fn: (root: T) => void): void;
  applyChanges(changes: Change[]): void;
  trigger<R>(selector: (root: T) => R): void;
}

function pathToString(path: Path): string {
  return path.map((p) => String(p)).join(".");
}

function isPathAffected(accessedPath: string, changedPath: string): boolean {
  if (accessedPath === changedPath) return true;
  if (accessedPath.startsWith(changedPath + ".")) return true;
  if (changedPath.startsWith(accessedPath + ".")) return true;
  return false;
}

function getLeafPaths(paths: Set<string>): Set<string> {
  const leafPaths = new Set<string>();
  for (const path of paths) {
    let isPrefix = false;
    for (const other of paths) {
      if (other !== path && other.startsWith(path + ".")) {
        isPrefix = true;
        break;
      }
    }
    if (!isPrefix) {
      leafPaths.add(path);
    }
  }
  return leafPaths;
}

export function createStore<T extends object>(initialValue?: Partial<T>): Store<T> {
  if (initialValue !== undefined) {
    assertSerializable(initialValue, "root");
  }

  const data: T = (initialValue ?? {}) as T;
  const subscriptions = new Set<Subscription<T, unknown>>();
  const changeSubscribers = new Set<(changes: Change[]) => void>();
  const proxyCache = new WeakMap<object, WeakRef<object>>();
  const arrayMutators = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);

  let isNotifying = false;
  let pendingNotification = false;
  let isInTransaction = false;
  const txChangedPaths = new Set<string>();
  const txChanges: Change[] = [];

  // --- helpers ---

  function getCachedProxy<U extends object>(target: U, factory: () => U): U {
    const ref = proxyCache.get(target);
    if (ref) {
      const cached = ref.deref();
      if (cached) return cached as U;
    }
    const proxy = factory();
    proxyCache.set(target, new WeakRef(proxy));
    return proxy;
  }

  function recordChange(change: Change, rollback: () => void): void {
    if (isInTransaction) {
      txChangedPaths.add(change.path);
      txChanges.push(change);
    } else {
      try {
        notifyChangeSubscribers([change]);
        notifySubscribers(new Set([change.path]));
      } catch (e) {
        rollback();
        throw e;
      }
    }
  }

  function runTransaction(fn: () => void): void {
    isInTransaction = true;
    txChangedPaths.clear();
    txChanges.length = 0;

    try {
      fn();
    } finally {
      isInTransaction = false;
      if (txChangedPaths.size > 0) {
        notifyChangeSubscribers([...txChanges]);
        notifySubscribers(new Set(txChangedPaths));
        txChangedPaths.clear();
        txChanges.length = 0;
      }
    }
  }

  function notifyChangeSubscribers(changes: Change[]): void {
    for (const callback of changeSubscribers) {
      callback(changes);
    }
  }

  function notifySubscribers(changedPaths: Set<string>, force = false): void {
    if (isNotifying) {
      pendingNotification = true;
      return;
    }

    isNotifying = true;

    try {
      for (const sub of subscriptions) {
        const pathsToCheck = force ? getLeafPaths(sub.paths) : sub.paths;
        let shouldNotify = false;

        for (const accessed of pathsToCheck) {
          for (const changed of changedPaths) {
            if (isPathAffected(accessed, changed)) {
              shouldNotify = true;
              break;
            }
          }
          if (shouldNotify) break;
        }

        if (shouldNotify) {
          const newPaths = new Set<string>();
          const proxy = createTrackingProxy(data, newPaths, []);
          const newValue = sub.selector(proxy);
          sub.paths = newPaths;

          if (force || !Object.is(newValue, sub.lastValue)) {
            sub.lastValue = newValue;
            sub.callback(newValue);
          }
        }
      }
    } finally {
      isNotifying = false;
      if (pendingNotification) {
        pendingNotification = false;
        notifySubscribers(changedPaths, force);
      }
    }
  }

  // --- proxies ---

  function createTrackingProxy<U extends object>(target: U, paths: Set<string>, currentPath: Path): U {
    return new Proxy(target, {
      get(obj, prop) {
        if (prop === Symbol.toStringTag || prop === Symbol.toPrimitive) return undefined;

        const value = Reflect.get(obj, prop);
        const newPath = [...currentPath, prop];
        paths.add(pathToString(newPath));

        if (typeof value === "function") return (value as Function).bind(obj);
        if (value !== null && typeof value === "object") {
          return createTrackingProxy(value as object, paths, newPath);
        }
        return value;
      },
    });
  }

  function createWriteProxy<U extends object>(target: U, currentPath: Path): U {
    return getCachedProxy(
      target,
      () =>
        new Proxy(target, {
          get(obj, prop) {
            if (prop === Symbol.toStringTag || prop === Symbol.toPrimitive) return undefined;

            const value: unknown = Reflect.get(obj, prop);

            // Intercept array mutating methods
            if (Array.isArray(obj) && typeof value === "function") {
              const propStr = String(prop);
              if (arrayMutators.has(propStr)) {
                return (...args: unknown[]) => {
                  const pathStr = pathToString(currentPath);
                  for (let i = 0; i < args.length; i++) {
                    assertSerializable(args[i], `${pathStr}.${propStr}(arg${i})`);
                  }
                  const snapshot = [...obj];
                  const result = (value as Function).apply(obj, args);
                  recordChange({ type: "array", path: pathStr, method: propStr, args }, () => {
                    obj.length = 0;
                    obj.push(...snapshot);
                  });
                  return result;
                };
              }
              return (value as Function).bind(obj);
            }

            if (value !== null && typeof value === "object") {
              return createWriteProxy(value as object, [...currentPath, prop]);
            }
            return value;
          },

          set(obj, prop, value) {
            const pathStr = pathToString([...currentPath, prop]);
            assertSerializable(value, pathStr);
            const oldValue = Reflect.get(obj, prop);
            Reflect.set(obj, prop, value);
            recordChange({ type: "property", path: pathStr, value }, () => Reflect.set(obj, prop, oldValue));
            return true;
          },

          deleteProperty(obj, prop) {
            if (!(prop in obj)) return true;
            const pathStr = pathToString([...currentPath, prop]);
            const oldValue = Reflect.get(obj, prop);
            Reflect.deleteProperty(obj, prop);
            recordChange({ type: "property", path: pathStr, value: undefined }, () => Reflect.set(obj, prop, oldValue));
            return true;
          },
        }),
    );
  }

  // --- path utilities for applyChanges ---

  function getValueAtPath(path: string): unknown {
    const segments = path.split(".");
    let current: unknown = data;
    for (const segment of segments) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  function setValueAtPath(path: string, value: unknown): void {
    const segments = path.split(".");
    if (segments.length === 0) return;
    let current = data as Record<string, unknown>;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!;
      if (current[segment] === null || current[segment] === undefined) {
        current[segment] = {};
      }
      current = current[segment] as Record<string, unknown>;
    }
    current[segments[segments.length - 1]!] = value;
  }

  // --- public API ---

  const rootProxy = createWriteProxy(data, []);

  return {
    get root(): T {
      return rootProxy;
    },

    snapshot(): T {
      return JSON.parse(JSON.stringify(data));
    },

    subscribe<R>(selector: (root: T) => R, callback: (value: R) => void): () => void {
      const paths = new Set<string>();
      const proxy = createTrackingProxy(data, paths, []);
      const initialValue = selector(proxy);

      const subscription: Subscription<T, R> = { selector, callback, paths, lastValue: initialValue };
      subscriptions.add(subscription as Subscription<T, unknown>);
      callback(initialValue);

      return () => {
        subscriptions.delete(subscription as Subscription<T, unknown>);
      };
    },

    subscribeToChanges(callback: (changes: Change[]) => void): () => void {
      changeSubscribers.add(callback);
      return () => {
        changeSubscribers.delete(callback);
      };
    },

    apply(fn: (root: T) => void): void {
      runTransaction(() => fn(rootProxy));
    },

    applyChanges(changes: Change[]): void {
      if (changes.length === 0) return;
      runTransaction(() => {
        for (const change of changes) {
          if (change.type === "property") {
            assertSerializable((change as PropertyChange).value, change.path);
            setValueAtPath(change.path, (change as PropertyChange).value);
          } else if (change.type === "array") {
            const arr = getValueAtPath(change.path);
            if (
              Array.isArray(arr) &&
              change.method in arr &&
              typeof arr[change.method as keyof typeof arr] === "function"
            ) {
              (arr[change.method as keyof typeof arr] as Function).apply(arr, change.args);
            }
          }
          txChangedPaths.add(change.path);
          txChanges.push(change);
        }
      });
    },

    trigger<R>(selector: (root: T) => R): void {
      const paths = new Set<string>();
      const proxy = createTrackingProxy(data, paths, []);
      selector(proxy);
      const leafPaths = getLeafPaths(paths);
      if (leafPaths.size > 0) {
        notifySubscribers(leafPaths, true);
      }
    },
  };
}
