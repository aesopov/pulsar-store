# pulsar-store

A lightweight TypeScript reactive store with automatic dependency tracking, similar to Preact signals.

## Installation

```bash
npm install pulsar-store
```

## Quick Start

```typescript
import { createStore } from 'pulsar-store';

interface AppState {
  user: { name: string; age: number };
  cart: { items: string[] };
}

const store = createStore<AppState>();

// Write like plain JS
store.root.user = { name: 'Alice', age: 30 };
store.root.cart = { items: [] };

// Subscribe to computed values
store.subscribe(
  root => root.user.name.toUpperCase(),
  name => console.log('Hello,', name)
);
// Logs: "Hello, ALICE"

// Changes trigger subscribers automatically
store.root.user.name = 'Bob';
// Logs: "Hello, BOB"
```

## Features

### Automatic Dependency Tracking

Subscriptions automatically track which properties are accessed:

```typescript
store.subscribe(
  root => root.cart.items.length,
  count => console.log(`${count} items in cart`)
);

// Only triggers when items.length changes
store.root.user.name = 'Charlie'; // No log
store.root.cart.items = ['apple', 'banana']; // Logs: "2 items in cart"
```

### Parent Changes Trigger Child Subscriptions

```typescript
store.subscribe(
  root => root.user.name,
  name => console.log(name)
);

// Replacing the parent object also triggers
store.root.user = { name: 'Dave', age: 25 };
// Logs: "Dave"
```

### Batched Updates with `apply()`

Multiple changes in a single notification:

```typescript
store.subscribe(
  root => root.user.name + ' (' + root.user.age + ')',
  info => console.log(info)
);

// Single notification for multiple changes
store.apply(root => {
  root.user.name = 'Eve';
  root.user.age = 28;
});
// Logs once: "Eve (28)"
```

### Manual Trigger

Force subscribers to fire even when values haven't changed:

```typescript
store.trigger(root => root.cart.items);
// All subscribers to cart.items or cart will fire
```

### Change Tracking

Subscribe to all changes with path and new values:

```typescript
store.subscribeToChanges(changes => {
  for (const change of changes) {
    if (change.type === 'property') {
      console.log(`${change.path} = ${change.value}`);
    } else {
      console.log(`${change.path}.${change.method}(${change.args.join(', ')})`);
    }
  }
});

store.root.user.name = 'Bob';
// Logs: "user.name = Bob"

store.root.cart.items.push('apple');
// Logs: "cart.items.push(apple)"
```

### Apply Changes

Replay changes from an array (useful for undo/redo, sync via postMessage, etc.):

```typescript
// Property changes
store.applyChanges([
  { type: 'property', path: 'user.name', value: 'Charlie' },
  { type: 'property', path: 'user.age', value: 30 },
]);

// Array changes
store.applyChanges([
  { type: 'array', path: 'cart.items', method: 'push', args: ['apple'] },
  { type: 'array', path: 'cart.items', method: 'splice', args: [0, 1] },
]);
```

### Unsubscribe

```typescript
const unsubscribe = store.subscribe(
  root => root.user.name,
  name => console.log(name)
);

// Later...
unsubscribe();
```

## Collection Tracking

Arrays are automatically tracked. Mutating methods trigger subscribers and emit changes.

```typescript
const store = createStore<AppState>({ cart: { items: [] } });

store.subscribe(
  root => root.cart.items.length,
  len => console.log(`${len} items`)
);

// Array methods trigger subscribers
store.root.cart.items.push('apple');
// Logs: "1 items"

store.root.cart.items.push('banana');
// Logs: "2 items"
```

**Tracked methods:**
- **Array**: `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`

## Error Handling & Rollback

If a `subscribeToChanges` callback throws an error, the store automatically rolls back the change:

```typescript
store.root.x = 4;
store.subscribeToChanges(() => { throw new Error('fail'); });

try {
  store.root.x = 5; // throws
} catch (e) {
  console.log(store.root.x); // 4 - rolled back
}
```

## API Reference

### `createStore<T>(initialValue?)`

Creates a new reactive store.

| Parameter | Type | Description |
|-----------|------|-------------|
| `initialValue` | `Partial<T>` | Initial state (optional) |

Returns a `Store<T>` object.

### `store.root`

The reactive root object. Read and write properties directly.

### `store.subscribe(selector, callback)`

Subscribe to computed values.

| Parameter | Type | Description |
|-----------|------|-------------|
| `selector` | `(root: T) => R` | Function that computes a value from state |
| `callback` | `(value: R) => void` | Called with initial value and on changes |

Returns an unsubscribe function.

### `store.apply(fn)`

Apply multiple changes in a single transaction (single notification).

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `(root: T) => void` | Function that mutates the state |

### `store.trigger(selector)`

Force subscribers to fire for the selected path and its parents.

| Parameter | Type | Description |
|-----------|------|-------------|
| `selector` | `(root: T) => R` | Function that selects a path |

### `store.subscribeToChanges(callback)`

Subscribe to all changes with full details.

| Parameter | Type | Description |
|-----------|------|-------------|
| `callback` | `(changes: Change[]) => void` | Called with array of changes |

Returns an unsubscribe function.

**Change types:**
```typescript
// Property assignment
interface PropertyChange {
  type: 'property';
  path: string;      // e.g., "user.name"
  value: unknown;    // new value
}

// Array mutation
interface ArrayChange {
  type: 'array';
  path: string;      // e.g., "cart.items"
  method: string;    // e.g., "push", "pop", "splice"
  args: unknown[];   // method arguments
}

type Change = PropertyChange | ArrayChange;
```

### `store.applyChanges(changes)`

Apply an array of changes to the store (useful for undo/redo, sync via postMessage).

| Parameter | Type | Description |
|-----------|------|-------------|
| `changes` | `Change[]` | Array of changes to apply |

## Infinite Loop Protection

The store prevents infinite loops when callbacks modify the store:

```typescript
store.subscribe(
  root => root.counter,
  count => {
    if (count < 10) {
      store.root.counter = count + 1; // Safe - queued for next notification
    }
  }
);
```

