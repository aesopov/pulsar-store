import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../src/index';

describe('applyChanges', () => {
  it('should apply property changes', () => {
    type Store = { counter: number; message: string };
    const store = createStore<Store>({ counter: 0, message: 'hello' });
    const callback = vi.fn();
    
    store.subscribe(root => `${root.message}: ${root.counter}`, callback);
    callback.mockClear();
    
    store.applyChanges([
      { type: 'property', path: 'counter', value: 42 },
      { type: 'property', path: 'message', value: 'updated' },
    ]);
    
    expect(callback).toHaveBeenCalledWith('updated: 42');
    expect(store.root.counter).toBe(42);
    expect(store.root.message).toBe('updated');
  });

  it('should apply array changes', () => {
    type Store = { items: string[] };
    const store = createStore<Store>({ items: ['a', 'b'] });
    const callback = vi.fn();
    
    store.subscribe(root => root.items.join(','), callback);
    callback.mockClear();
    
    store.applyChanges([
      { type: 'array', path: 'items', method: 'push', args: ['c', 'd'] },
    ]);
    
    expect(callback).toHaveBeenCalledWith('a,b,c,d');
    expect(store.root.items).toEqual(['a', 'b', 'c', 'd']);
  });

  it('should batch notifications from multiple changes', () => {
    type Store = { a: number; b: number };
    const store = createStore<Store>({ a: 1, b: 2 });
    const callback = vi.fn();
    
    store.subscribe(root => root.a + root.b, callback);
    callback.mockClear();
    
    store.applyChanges([
      { type: 'property', path: 'a', value: 10 },
      { type: 'property', path: 'b', value: 20 },
    ]);
    
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(30);
  });

  it('should work with nested paths', () => {
    type Store = { user: { profile: { name: string } } };
    const store = createStore<Store>({ user: { profile: { name: 'Alice' } } });
    
    store.applyChanges([
      { type: 'property', path: 'user.profile.name', value: 'Bob' },
    ]);
    
    expect(store.root.user.profile.name).toBe('Bob');
  });
});
