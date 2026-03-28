import { Controller, INestMicroservice } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MessagePattern, Payload, Ctx } from '@nestjs/microservices';
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

  @MessagePattern('get.observable')
  getObservable(@Payload() data: any): Observable<any> {
    return of({ value: data.input, source: 'observable' });
  }

  @MessagePattern('get.context')
  getContext(@Ctx() ctx: MemoryContext) {
    return { pattern: ctx.getPattern() };
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
});
