import { Controller, INestMicroservice } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MessagePattern, EventPattern, Payload, Ctx } from '@nestjs/microservices';
import { Observable, of } from 'rxjs';
import { MemoryServer } from '../../src/memory-server';
import { MemoryContext } from '../../src/memory-context';

@Controller()
class OrdersController {
  @MessagePattern('get.order')
  getOrder(@Payload() data: { id: string }) {
    return { orderId: data.id, status: 'shipped', amount: 99.99 };
  }

  @MessagePattern({ cmd: 'create.order' })
  createOrder(@Payload() data: { amount: number }) {
    return { orderId: 'new-001', amount: data.amount, status: 'created' };
  }

  @MessagePattern({ scope: 'orders', cmd: 'archive' })
  archiveOrder(@Payload() data: { id: string }) {
    return { orderId: data.id, status: 'archived' };
  }

  @MessagePattern(42)
  numericPattern() {
    return { matched: 'numeric' };
  }

  @MessagePattern('get.observable')
  getObservable(@Payload() data: any): Observable<any> {
    return of({ value: data.input, source: 'observable' });
  }

  @MessagePattern('get.context')
  getContext(@Ctx() ctx: MemoryContext) {
    return { pattern: ctx.getPattern() };
  }

  @EventPattern('order.notified')
  handleNotified() {
    // Registered as an event handler -- request() must reject for this pattern.
  }
}

describe('MessagePattern integration', () => {
  let app: INestMicroservice;
  let server: MemoryServer;

  beforeAll(async () => {
    server = new MemoryServer();
    const module = await Test.createTestingModule({
      controllers: [OrdersController],
    }).compile();
    app = module.createNestMicroservice({ strategy: server });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should invoke the handler and return the result (string pattern)', async () => {
    const result = await server.request('get.order', { id: 'order-42' });

    expect(result).toEqual({ orderId: 'order-42', status: 'shipped', amount: 99.99 });
  });

  it('should support object patterns', async () => {
    const result = await server.request({ cmd: 'create.order' }, { amount: 149.99 });

    expect(result).toEqual({
      orderId: 'new-001',
      amount: 149.99,
      status: 'created',
    });
  });

  it('should support multi-key object patterns declared in the same key order', async () => {
    const result = await server.request({ scope: 'orders', cmd: 'archive' }, { id: 'order-7' });

    expect(result).toEqual({ orderId: 'order-7', status: 'archived' });
  });

  it('should match multi-key object patterns regardless of key order', async () => {
    const result = await server.request({ cmd: 'archive', scope: 'orders' }, { id: 'order-8' });

    expect(result).toEqual({ orderId: 'order-8', status: 'archived' });
  });

  it('should support numeric patterns', async () => {
    const result = await server.request(42, {});

    expect(result).toEqual({ matched: 'numeric' });
  });

  it('should handle handlers that return Observables', async () => {
    const result = await server.request('get.observable', { input: 'test-data' });

    expect(result).toEqual({ value: 'test-data', source: 'observable' });
  });

  it('should pass MemoryContext to the handler', async () => {
    const result = await server.request('get.context', {});

    expect(result).toEqual({ pattern: 'get.context' });
  });

  it('should throw for an unregistered message pattern', async () => {
    await expect(server.request('unknown.pattern', {})).rejects.toThrow(
      'No handler found for pattern',
    );
  });

  it('should reject when the pattern belongs to an event handler', async () => {
    await expect(server.request('order.notified', {})).rejects.toThrow(
      'is registered as an @EventPattern handler',
    );
  });
});
