import {
  CallHandler,
  Controller,
  ExecutionContext,
  INestMicroservice,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventPattern, Payload, Ctx } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { MemoryServer } from '../../src/memory-server';
import { MemoryContext } from '../../src/memory-context';

let receivedPayloads: any[] = [];
let receivedContexts: MemoryContext[] = [];
let completions: string[] = [];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
class PassThroughInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle();
  }
}

@Controller()
class OrderEventsController {
  @EventPattern('order.created')
  handleOrderCreated(@Payload() data: any, @Ctx() ctx: MemoryContext) {
    receivedPayloads.push(data);
    receivedContexts.push(ctx);
  }

  @EventPattern('order.shipped')
  async handleOrderShipped() {
    await delay(20);
    completions.push('plain');
  }

  @UseInterceptors(PassThroughInterceptor)
  @EventPattern('order.delivered')
  async handleOrderDelivered() {
    await delay(20);
    completions.push('intercepted');
  }

  @EventPattern('order.archived')
  async handleArchivedFirst() {
    await delay(20);
    completions.push('first');
  }

  @EventPattern('order.archived')
  async handleArchivedSecond() {
    await delay(20);
    completions.push('second');
  }

  @EventPattern({ scope: 'orders', event: 'refunded' })
  handleRefund(@Payload() data: any, @Ctx() ctx: MemoryContext) {
    receivedPayloads.push(data);
    receivedContexts.push(ctx);
  }

  @EventPattern('order.failed')
  async handleOrderFailed() {
    await delay(20);
    completions.push('failed');
    throw new Error('handler blew up');
  }
}

describe('EventPattern integration', () => {
  let app: INestMicroservice;
  let server: MemoryServer;

  beforeAll(async () => {
    server = new MemoryServer();
    const module = await Test.createTestingModule({
      controllers: [OrderEventsController],
    }).compile();
    app = module.createNestMicroservice({ strategy: server });
    await app.init();
  });

  beforeEach(() => {
    receivedPayloads = [];
    receivedContexts = [];
    completions = [];
  });

  afterAll(async () => {
    await app.close();
  });

  it('should invoke the event handler with the correct payload', async () => {
    await server.emit('order.created', { orderId: '123', amount: 49.99 });

    expect(receivedPayloads).toHaveLength(1);
    expect(receivedPayloads[0]).toEqual({ orderId: '123', amount: 49.99 });
  });

  it('should pass a MemoryContext to the handler', async () => {
    await server.emit('order.created', { orderId: '456' });

    expect(receivedContexts).toHaveLength(1);
    expect(receivedContexts[0]).toBeInstanceOf(MemoryContext);
    expect(receivedContexts[0].getPattern()).toBe('order.created');
  });

  it('should handle multiple emissions', async () => {
    await server.emit('order.created', { orderId: 'a' });
    await server.emit('order.created', { orderId: 'b' });
    await server.emit('order.created', { orderId: 'c' });

    expect(receivedPayloads).toHaveLength(3);
    expect(receivedPayloads.map((p: any) => p.orderId)).toEqual(['a', 'b', 'c']);
  });

  it('should not throw for an unregistered event pattern', async () => {
    await expect(server.emit('unknown.event', { data: 'test' })).resolves.toBeUndefined();
  });

  it('should await an async handler before resolving', async () => {
    await server.emit('order.shipped', {});

    expect(completions).toEqual(['plain']);
  });

  it('should await an async handler wrapped by an interceptor before resolving', async () => {
    await server.emit('order.delivered', {});

    expect(completions).toEqual(['intercepted']);
  });

  it('should await every handler registered for the same pattern', async () => {
    await server.emit('order.archived', {});

    expect(completions).toHaveLength(2);
    expect(completions).toEqual(expect.arrayContaining(['first', 'second']));
  });

  it('should match object patterns regardless of key order', async () => {
    await server.emit({ event: 'refunded', scope: 'orders' }, { orderId: '789' });

    expect(receivedPayloads).toHaveLength(1);
    expect(receivedPayloads[0]).toEqual({ orderId: '789' });
  });

  it('should not reject when a handler throws, but still await it', async () => {
    await expect(server.emit('order.failed', {})).resolves.toBeUndefined();

    expect(completions).toEqual(['failed']);
  });

  it('should expose the normalized object pattern on the context', async () => {
    await server.emit({ scope: 'orders', event: 'refunded' }, { orderId: '790' });

    expect(receivedContexts[0].getPattern()).toBe('{"event":"refunded","scope":"orders"}');
  });
});
