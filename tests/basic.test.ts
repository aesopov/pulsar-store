import { describe, it, expect } from 'vitest';
import { createStore } from '../src/index';

describe('Basic read/write', () => {
  it('should read and write nested properties', () => {
    type MyStore = { a: { b: { x: number; y: number } } };
    const store = createStore<MyStore>();
    
    store.root.a = { b: { x: 1, y: 2 } };
    
    expect(store.root.a.b.x).toBe(1);
    expect(store.root.a.b.y).toBe(2);
  });

  it('should update nested properties', () => {
    type MyStore = { a: { b: { x: number } } };
    const store = createStore<MyStore>({ a: { b: { x: 1 } } });
    
    store.root.a.b.x = 10;
    
    expect(store.root.a.b.x).toBe(10);
  });
});
