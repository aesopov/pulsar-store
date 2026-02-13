import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../src/index';

describe('apply (transactions)', () => {
  type MyStore = { a: { b: { x: number; y: number } } };

  it('should batch multiple changes into single notification', () => {
    const store = createStore<MyStore>({ a: { b: { x: 1, y: 2 } } });
    const callback = vi.fn();
    
    store.subscribe(root => root.a.b.x + root.a.b.y, callback);
    callback.mockClear();
    
    store.apply(root => {
      root.a.b.x = 5;
      root.a.b.y = 6;
    });
    
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(11);
  });

  it('should only notify once even with multiple path changes', () => {
    type Store = { a: number; b: number; c: number };
    const store = createStore<Store>({ a: 1, b: 2, c: 3 });
    const callback = vi.fn();
    
    store.subscribe(root => root.a + root.b + root.c, callback);
    callback.mockClear();
    
    store.apply(root => {
      root.a = 10;
      root.b = 20;
      root.c = 30;
    });
    
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(60);
  });
});
