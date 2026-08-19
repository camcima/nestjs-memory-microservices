import { CustomTransportStrategy, MessageHandler, MsPattern, Server } from '@nestjs/microservices';
import { isObservable, lastValueFrom } from 'rxjs';
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
   * Fire-and-forget: invokes every @EventPattern handler registered for the
   * pattern through the full NestJS pipeline (guards, interceptors, pipes,
   * filters) and resolves once they have all run to completion.
   *
   * Like a real transport, this never rejects -- handler errors are routed
   * through the exception filters and then discarded.
   */
  public async emit(pattern: MsPattern, data: any): Promise<void> {
    const route = this.normalizePattern(pattern);
    const handler = this.messageHandlers.get(route);
    if (!handler) {
      this.logger.error(
        `There is no matching event handler defined in the remote service. Event pattern: ${route}`,
      );
      return;
    }
    try {
      await this.invokeHandler(handler, route, data);
    } catch {
      // Events are fire-and-forget. The pipeline has already passed this error
      // through the registered exception filters; surfacing it here would make
      // emit() reject, which no real transport does.
    }
  }

  /**
   * Request-response: invokes the @MessagePattern handler for the pattern
   * through the full NestJS pipeline and resolves with its result.
   */
  public async request<T = any>(pattern: MsPattern, data: any): Promise<T> {
    const route = this.normalizePattern(pattern);
    const handler = this.messageHandlers.get(route);
    if (!handler) {
      throw new Error(
        `No handler found for pattern: ${route}. ` +
          `Registered patterns: [${[...this.messageHandlers.keys()].join(', ')}]`,
      );
    }
    if (handler.isEventHandler) {
      throw new Error(
        `Pattern ${route} is registered as an @EventPattern handler, which returns no response. ` +
          `Use emit() instead of request().`,
      );
    }
    return this.invokeHandler(handler, route, data) as Promise<T>;
  }

  /**
   * Invokes a pipeline-wrapped handler and awaits its completion.
   *
   * Handlers return a plain value, a Promise, or an Observable. NestJS produces
   * an Observable whenever interceptors are attached or several @EventPattern
   * handlers share a pattern (they are combined with `forkJoin`), so the stream
   * must be awaited rather than merely subscribed to -- otherwise callers
   * resolve before the handler has finished.
   */
  private async invokeHandler(handler: MessageHandler, route: string, data: any): Promise<any> {
    const ctx = new MemoryContext([route]);
    const resultOrStream = await handler(data, ctx);
    return isObservable(resultOrStream) ? lastValueFrom(resultOrStream) : resultOrStream;
  }
}
