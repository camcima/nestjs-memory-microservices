import { MessageHandler } from '@nestjs/microservices';
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
      server.getHandlers().set(
        'test',
        vi.fn(async () => undefined),
      );
      expect(server.getHandlers().size).toBe(1);

      server.close();
      expect(server.getHandlers().size).toBe(0);
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
        'No handler found for pattern: unknown.pattern',
      );
    });

    it('should include registered patterns in error message', async () => {
      server.getHandlers().set(
        'known.pattern',
        vi.fn(async () => undefined),
      );
      await expect(server.request('unknown.pattern', {})).rejects.toThrow(
        'Registered patterns: [known.pattern]',
      );
    });

    it('should report the normalized route for an unmatched object pattern', async () => {
      await expect(server.request({ scope: 'orders', cmd: 'archive' }, {})).rejects.toThrow(
        'No handler found for pattern: {"cmd":"archive","scope":"orders"}',
      );
    });

    it('should reject when the matched handler is an event handler', async () => {
      const handler: MessageHandler = vi.fn(async () => undefined);
      handler.isEventHandler = true;
      server.getHandlers().set('some.event', handler);

      await expect(server.request('some.event', {})).rejects.toThrow(
        'Pattern some.event is registered as an @EventPattern handler',
      );
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('should resolve without invoking anything when no handler is registered', async () => {
      await expect(server.emit('unknown.event', {})).resolves.toBeUndefined();
    });
  });
});
