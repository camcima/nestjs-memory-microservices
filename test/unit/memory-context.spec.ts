import { MemoryContext } from '../../src/memory-context';

describe('MemoryContext', () => {
  it('should store the pattern in args', () => {
    const ctx = new MemoryContext(['order.created']);
    expect(ctx.getArgs()).toEqual(['order.created']);
  });

  it('should return the pattern via getPattern()', () => {
    const ctx = new MemoryContext(['order.created']);
    expect(ctx.getPattern()).toBe('order.created');
  });

  it('should return the pattern via getArgByIndex(0)', () => {
    const ctx = new MemoryContext(['user.registered']);
    expect(ctx.getArgByIndex(0)).toBe('user.registered');
  });
});
