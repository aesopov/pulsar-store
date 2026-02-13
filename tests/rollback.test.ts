import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../src/index';

describe('Rollback on error', () => {
  it('should rollback property change when subscribeToChanges throws', () => {
    type Store = { x: number };
    const store = createStore<Store>({ x: 4 });
    
    store.subscribeToChanges(() => {
      throw new Error('Subscriber error');
    });
    
    expect(() => {
      store.root.x = 5;
    }).toThrow('Subscriber error');
    
    expect(store.root.x).toBe(4);
  });

  it('should rollback array push when subscribeToChanges throws', () => {
    type Store = { items: string[] };
    const store = createStore<Store>({ items: ['a', 'b'] });
    
    store.subscribeToChanges(() => {
      throw new Error('Subscriber error');
    });
    
    expect(() => {
      store.root.items.push('c');
    }).toThrow('Subscriber error');
    
    expect(store.root.items).toEqual(['a', 'b']);
  });

  it('should rollback array pop when subscribeToChanges throws', () => {
    type Store = { items: string[] };
    const store = createStore<Store>({ items: ['a', 'b', 'c'] });
    
    store.subscribeToChanges(() => {
      throw new Error('Subscriber error');
    });
    
    expect(() => {
      store.root.items.pop();
    }).toThrow('Subscriber error');
    
    expect(store.root.items).toEqual(['a', 'b', 'c']);
  });

  it('should rollback array splice when subscribeToChanges throws', () => {
    type Store = { items: string[] };
    const store = createStore<Store>({ items: ['a', 'b', 'c'] });
    
    store.subscribeToChanges(() => {
      throw new Error('Subscriber error');
    });
    
    expect(() => {
      store.root.items.splice(1, 1, 'x', 'y');
    }).toThrow('Subscriber error');
    
    expect(store.root.items).toEqual(['a', 'b', 'c']);
  });

  it('should still notify regular subscribers if no error', () => {
    type Store = { x: number };
    const store = createStore<Store>({ x: 1 });
    const callback = vi.fn();
    
    store.subscribe(root => root.x, callback);
    callback.mockClear();
    
    store.root.x = 10;
    
    expect(callback).toHaveBeenCalledWith(10);
    expect(store.root.x).toBe(10);
  });
});
