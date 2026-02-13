import { describe, it, expect } from 'vitest';
import { createStore } from '../src/index';

describe('Infinite loop protection', () => {
  it('should limit recursive updates from callbacks', () => {
    type Store = { a: { b: { x: number } } };
    const store = createStore<Store>({ a: { b: { x: 1 } } });
    
    let loopCount = 0;
    store.subscribe(
      root => root.a.b.x,
      x => {
        loopCount++;
        if (loopCount < 5 && x < 100) {
          store.root.a.b.x = x * 2;
        }
      }
    );
    
    // Should not hang, callback stops at 5 iterations
    expect(loopCount).toBe(5);
    expect(store.root.a.b.x).toBe(16);
  });
});
