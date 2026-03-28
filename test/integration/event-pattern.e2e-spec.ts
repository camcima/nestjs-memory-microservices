import { Controller, INestMicroservice } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventPattern, Payload, Ctx } from '@nestjs/microservices';
import { MemoryServer } from '../../src/memory-server';
import { MemoryContext } from '../../src/memory-context';

let receivedPayloads: any[] = [];
let receivedContexts: MemoryContext[] = [];

@Controller()
class OrderEventsController {
  @EventPattern('order.created')
  handleOrderCreated(@Payload() data: any, @Ctx() ctx: MemoryContext) {
    receivedPayloads.push(data);
    receivedContexts.push(ctx);
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
    await expect(
      server.emit('unknown.event', { data: 'test' }),
    ).resolves.toBeUndefined();
  });
});
