import { MemoryServer, MEMORY_TRANSPORT } from '../../src/memory-server';

describe('MemoryServer', () => {
  let server: MemoryServer;

  beforeEach(() => {
    server = new MemoryServer();
  });

  describe('transportId', () => {
    it('should have a symbol transport ID', () => {
      expect(typeof server.transportId).toBe('symbol');
      expect(server.transportId).toBe(MEMORY_TRANSPORT);
    });
  });

  describe('listen', () => {
    it('should call the callback synchronously', () => {
      const callback = vi.fn();
      server.listen(callback);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('close', () => {
    it('should clear message handlers', () => {
      // Access the internal map to verify it gets cleared
      (server as any).messageHandlers.set('test', vi.fn());
      expect((server as any).messageHandlers.size).toBe(1);

      server.close();
      expect((server as any).messageHandlers.size).toBe(0);
    });
  });

  describe('on', () => {
    it('should not throw', () => {
      expect(() => server.on('connect', vi.fn())).not.toThrow();
    });
  });

  describe('unwrap', () => {
    it('should return the server instance', () => {
      expect(server.unwrap()).toBe(server);
    });
  });

  describe('request', () => {
    it('should throw when no handler is registered for the pattern', async () => {
      await expect(server.request('unknown.pattern', {})).rejects.toThrow(
        'No handler found for pattern: "unknown.pattern"',
      );
    });

    it('should include registered patterns in error message', async () => {
      (server as any).messageHandlers.set('known.pattern', vi.fn());
      await expect(server.request('unknown.pattern', {})).rejects.toThrow(
        'Registered patterns: [known.pattern]',
      );
    });
  });
});
