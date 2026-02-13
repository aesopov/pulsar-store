import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../src/index';

describe('trigger', () => {
  type Store = { data: { value: number; label: string } };

  it('should force callback even when value unchanged', () => {
    const store = createStore<Store>({ data: { value: 42, label: 'test' } });
    const callback = vi.fn();
    
    store.subscribe(root => root.data.value, callback);
    callback.mockClear();
    
    store.trigger(root => root.data.value);
    
    expect(callback).toHaveBeenCalledWith(42);
  });

  it('should trigger when parent path is triggered', () => {
    const store = createStore<Store>({ data: { value: 42, label: 'test' } });
    const callback = vi.fn();
    
    store.subscribe(root => root.data.value, callback);
    callback.mockClear();
    
    store.trigger(root => root.data);
    
    expect(callback).toHaveBeenCalledWith(42);
  });

  it('should NOT trigger sibling paths', () => {
    const store = createStore<Store>({ data: { value: 42, label: 'test' } });
    const callback = vi.fn();
    
    store.subscribe(root => root.data.value, callback);
    callback.mockClear();
    
    store.trigger(root => root.data.label);
    
    expect(callback).not.toHaveBeenCalled();
  });
});
