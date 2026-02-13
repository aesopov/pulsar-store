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
  // If the changed path is a prefix of or equal to the accessed path, it's affected
  // e.g., changing "a.b" affects "a.b.x" and "a.b"
  if (accessedPath === changedPath || accessedPath.startsWith(changedPath + ".")) {
    return true;
  }
  // If the accessed path is a prefix of the changed path, it's also affected
  // e.g., accessing "a.b" is affected when "a.b.x" changes (because the object reference might matter)
  if (changedPath.startsWith(accessedPath + ".")) {
    return true;
  }
  return false;
}

export function createStore<T extends object>(initialValue?: Partial<T>): Store<T> {
  if (initialValue !== undefined) {
    assertSerializable(initialValue, "root");
  }
  const data: T = (initialValue ?? {}) as T;
  const subscriptions = new Set<Subscription<T, unknown>>();
  const changeSubscribers = new Set<(changes: Change[]) => void>();
  let isNotifying = false;
  let pendingNotification = false;
  let isInTransaction = false;
  const changedPathsDuringTransaction = new Set<string>();
  const changesDuringTransaction: Change[] = [];

  // Mutating methods for arrays
  const arrayMutators = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);

  // Cache proxies by target object for referential stability
  const proxyCache = new WeakMap<object, WeakRef<object>>();

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

  function createArrayProxy<C extends unknown[]>(collection: C, currentPath: Path): C {
    return getCachedProxy(
      collection,
      () =>
        new Proxy(collection, {
          get(obj, prop) {
            const value = Reflect.get(obj, prop);

            if (typeof value !== "function") {
              if (value !== null && typeof value === "object") {
                return createWriteProxy(value as object, [...currentPath, prop]);
              }
              return value;
            }

            // Check if this is a mutating method
            const propStr = String(prop);
            if (arrayMutators.has(propStr)) {
              return function (this: C, ...args: unknown[]) {
                const pathStr = pathToString(currentPath);

                // Validate args are serializable
                for (let i = 0; i < args.length; i++) {
                  assertSerializable(args[i], `${pathStr}.${propStr}(arg${i})`);
                }

                // Capture state for rollback
                const oldArray = [...obj];

                const result = (value as Function).apply(obj, args);

                const change: ArrayChange = {
                  type: "array",
                  path: pathStr,
                  method: propStr,
                  args: args,
                };

                if (isInTransaction) {
                  changedPathsDuringTransaction.add(pathStr);
                  changesDuringTransaction.push(change);
                } else {
                  try {
                    notifyChangeSubscribers([change]);
                    notifySubscribers(new Set([pathStr]));
                  } catch (e) {
                    // Rollback array to previous state
                    obj.length = 0;
                    obj.push(...oldArray);
                    throw e;
                  }
                }

                return result;
              };
            }

            // Non-mutating methods need proper binding
            return (value as Function).bind(obj);
          },

          set(obj, prop, value) {
            const newPath = [...currentPath, prop];
            const pathStr = pathToString(newPath);

            assertSerializable(value, pathStr);

            const oldValue = Reflect.get(obj, prop);

            Reflect.set(obj, prop, value);

            const change: PropertyChange = {
              type: "property",
              path: pathStr,
              value,
            };

            if (isInTransaction) {
              changedPathsDuringTransaction.add(pathStr);
              changesDuringTransaction.push(change);
            } else {
              try {
                notifyChangeSubscribers([change]);
                notifySubscribers(new Set([pathStr]));
              } catch (e) {
                // Rollback
                Reflect.set(obj, prop, oldValue);
                throw e;
              }
            }

            return true;
          },

          deleteProperty(obj, prop) {
            if (!(prop in obj)) return true;

            const newPath = [...currentPath, prop];
            const pathStr = pathToString(newPath);
            const oldValue = Reflect.get(obj, prop);

            Reflect.deleteProperty(obj, prop);

            const change: PropertyChange = { type: "property", path: pathStr, value: undefined };

            if (isInTransaction) {
              changedPathsDuringTransaction.add(pathStr);
              changesDuringTransaction.push(change);
            } else {
              try {
                notifyChangeSubscribers([change]);
                notifySubscribers(new Set([pathStr]));
              } catch (e) {
                Reflect.set(obj, prop, oldValue);
                throw e;
              }
            }

            return true;
          },
        }),
    );
  }

  function createTrackingProxy<U extends object>(target: U, paths: Set<string>, currentPath: Path): U {
    return new Proxy(target, {
      get(obj, prop) {
        if (prop === Symbol.toStringTag || prop === Symbol.toPrimitive) {
          return undefined;
        }

        const value = Reflect.get(obj, prop);
        const newPath = [...currentPath, prop];
        const pathStr = pathToString(newPath);
        paths.add(pathStr);

        // Bind methods for Map, Set, and Array to work correctly
        if (typeof value === "function") {
          return (value as Function).bind(obj);
        }

        if (value !== null && typeof value === "object") {
          return createTrackingProxy(value as object, paths, newPath);
        }
        return value;
      },
    });
  }

  function notifySubscribers(changedPaths: Set<string>, force = false): void {
    if (isNotifying) {
      pendingNotification = true;
      return;
    }

    isNotifying = true;

    try {
      for (const sub of subscriptions) {
        // Check if any of the subscription's tracked paths are affected
        let shouldNotify = false;

        // For forced triggers, only consider leaf paths of the subscription
        const pathsToCheck = force ? getLeafPaths(sub.paths) : sub.paths;

        for (const accessedPath of pathsToCheck) {
          for (const changedPath of changedPaths) {
            if (isPathAffected(accessedPath, changedPath)) {
              shouldNotify = true;
              break;
            }
          }
          if (shouldNotify) break;
        }

        if (shouldNotify) {
          // Re-track paths and compute new value
          const newPaths = new Set<string>();
          const proxy = createTrackingProxy(data, newPaths, []);
          const newValue = sub.selector(proxy);

          // Update tracked paths
          sub.paths = newPaths;

          // Call callback if value changed, or if forced
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
        // Re-notify with collected changes during notification
        // This handles the case where a callback modifies the store
        notifySubscribers(changedPaths, force);
      }
    }
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

  function notifyChangeSubscribers(changes: Change[]): void {
    if (changes.length === 0) return;
    for (const callback of changeSubscribers) {
      callback(changes);
    }
  }

  function createWriteProxy<U extends object>(target: U, currentPath: Path): U {
    return getCachedProxy(
      target,
      () =>
        new Proxy(target, {
          get(obj, prop) {
            if (prop === Symbol.toStringTag || prop === Symbol.toPrimitive) {
              return undefined;
            }

            const value: unknown = Reflect.get(obj, prop);

            if (value !== null && typeof value === "object") {
              const newPath = [...currentPath, prop];
              // Use array proxy for Arrays
              if (Array.isArray(value)) {
                return createArrayProxy(value, newPath);
              }
              return createWriteProxy(value as object, newPath);
            }
            return value;
          },

          set(obj, prop, value) {
            const newPath = [...currentPath, prop];
            const pathStr = pathToString(newPath);

            assertSerializable(value, pathStr);

            const oldValue = Reflect.get(obj, prop);

            Reflect.set(obj, prop, value);

            const change: PropertyChange = {
              type: "property",
              path: pathStr,
              value,
            };

            if (isInTransaction) {
              changesDuringTransaction.push(change);
              changedPathsDuringTransaction.add(pathStr);
            } else {
              try {
                notifyChangeSubscribers([change]);
                notifySubscribers(new Set([pathStr]));
              } catch (e) {
                // Rollback
                Reflect.set(obj, prop, oldValue);
                throw e;
              }
            }

            return true;
          },

          deleteProperty(obj, prop) {
            if (!(prop in obj)) return true;

            const newPath = [...currentPath, prop];
            const pathStr = pathToString(newPath);
            const oldValue = Reflect.get(obj, prop);

            Reflect.deleteProperty(obj, prop);

            const change: PropertyChange = { type: "property", path: pathStr, value: undefined };

            if (isInTransaction) {
              changesDuringTransaction.push(change);
              changedPathsDuringTransaction.add(pathStr);
            } else {
              try {
                notifyChangeSubscribers([change]);
                notifySubscribers(new Set([pathStr]));
              } catch (e) {
                Reflect.set(obj, prop, oldValue);
                throw e;
              }
            }

            return true;
          },
        }),
    );
  }

  const rootProxy = createWriteProxy(data, []);

  return {
    get root(): T {
      return rootProxy;
    },

    snapshot(): T {
      return JSON.parse(JSON.stringify(data));
    },

    subscribe<R>(selector: (root: T) => R, callback: (value: R) => void): () => void {
      // Initial tracking
      const paths = new Set<string>();
      const proxy = createTrackingProxy(data, paths, []);
      const initialValue = selector(proxy);

      const subscription: Subscription<T, R> = {
        selector,
        callback,
        paths,
        lastValue: initialValue,
      };

      subscriptions.add(subscription as Subscription<T, unknown>);

      // Call with initial value
      callback(initialValue);

      // Return unsubscribe function
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
      isInTransaction = true;
      changedPathsDuringTransaction.clear();
      changesDuringTransaction.length = 0;

      try {
        fn(rootProxy);
      } finally {
        isInTransaction = false;
        if (changedPathsDuringTransaction.size > 0) {
          notifyChangeSubscribers([...changesDuringTransaction]);
          notifySubscribers(new Set(changedPathsDuringTransaction));
          changedPathsDuringTransaction.clear();
          changesDuringTransaction.length = 0;
        }
      }
    },

    applyChanges(changes: Change[]): void {
      if (changes.length === 0) return;

      isInTransaction = true;
      changedPathsDuringTransaction.clear();
      changesDuringTransaction.length = 0;

      try {
        for (const change of changes) {
          if (change.type === "property") {
            assertSerializable((change as PropertyChange).value, change.path);
            setValueAtPath(change.path, (change as PropertyChange).value);
          } else if (change.type === "array") {
            // Array change - get the array and apply the method
            const arr = getValueAtPath(change.path) as unknown[];
            if (
              Array.isArray(arr) &&
              typeof (arr as unknown as Record<string, unknown>)[change.method] === "function"
            ) {
              ((arr as unknown as Record<string, unknown>)[change.method] as Function).apply(arr, change.args);
            }
          }
          changedPathsDuringTransaction.add(change.path);
          changesDuringTransaction.push(change);
        }
      } finally {
        isInTransaction = false;
        if (changedPathsDuringTransaction.size > 0) {
          notifyChangeSubscribers([...changesDuringTransaction]);
          notifySubscribers(new Set(changedPathsDuringTransaction));
          changedPathsDuringTransaction.clear();
          changesDuringTransaction.length = 0;
        }
      }
    },

    trigger<R>(selector: (root: T) => R): void {
      // Track which paths the selector accesses
      const paths = new Set<string>();
      const proxy = createTrackingProxy(data, paths, []);
      selector(proxy);

      // Only use the deepest (leaf) paths for triggering
      // Filter out paths that are prefixes of other paths
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

      // Force notify subscribers for leaf paths only
      if (leafPaths.size > 0) {
        notifySubscribers(leafPaths, true);
      }
    },
  };
}
