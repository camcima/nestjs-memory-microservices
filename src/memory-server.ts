import { CustomTransportStrategy } from '@nestjs/microservices';
import { Server } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { MemoryContext } from './memory-context';

export const MEMORY_TRANSPORT = Symbol('MEMORY_TRANSPORT');

export class MemoryServer extends Server implements CustomTransportStrategy {
  public readonly transportId = MEMORY_TRANSPORT;

  public listen(callback: () => void): void {
    callback();
  }

  public close(): void {
    this.messageHandlers.clear();
  }

  public on<EventKey extends string, EventCallback extends Function>(
    _event: EventKey,
    _callback: EventCallback,
  ): void {
    // No-op: no connection status events for in-memory transport
  }

  public unwrap<T>(): T {
    return this as unknown as T;
  }

  /**
   * Fire-and-forget: invokes all @EventPattern handlers for the given pattern
   * through the full NestJS pipeline (guards, interceptors, pipes, filters).
   */
  public async emit(pattern: string | object, data: any): Promise<void> {
    const normalizedPattern = typeof pattern === 'string' ? pattern : JSON.stringify(pattern);
    const packet = { pattern, data };
    const ctx = new MemoryContext([normalizedPattern]);
    await this.handleEvent(normalizedPattern, packet, ctx);
  }

  /**
   * Request-response: invokes the @MessagePattern handler for the given pattern
   * through the full NestJS pipeline and returns the result.
   */
  public async request<T = any>(pattern: string | object, data: any): Promise<T> {
    const normalizedPattern = typeof pattern === 'string' ? pattern : JSON.stringify(pattern);
    const handler = this.messageHandlers.get(normalizedPattern);
    if (!handler) {
      throw new Error(
        `No handler found for pattern: ${JSON.stringify(pattern)}. ` +
          `Registered patterns: [${[...this.messageHandlers.keys()].join(', ')}]`,
      );
    }
    const ctx = new MemoryContext([normalizedPattern]);
    const result$ = this.transformToObservable(await handler(data, ctx));
    return lastValueFrom(result$) as Promise<T>;
  }
}
