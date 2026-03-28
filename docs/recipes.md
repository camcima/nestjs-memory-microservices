# Recipes

Common testing patterns and real-world examples for `nestjs-memory-microservice`.

## Recipe 1: Testing a CQRS-Style Microservice

A common pattern is separating commands (writes) from queries (reads):

```ts
@Controller()
class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @EventPattern('order.created')
  async handleOrderCreated(@Payload() data: CreateOrderEvent) {
    await this.ordersService.processNewOrder(data);
  }

  @MessagePattern('get.order')
  async getOrder(@Payload() query: { id: string }) {
    return this.ordersService.findById(query.id);
  }

  @MessagePattern('list.orders')
  async listOrders(@Payload() query: { userId: string; limit?: number }) {
    return this.ordersService.findByUser(query.userId, query.limit);
  }
}
```

```ts
describe('OrdersController', () => {
  let server: MemoryServer;
  let ordersService: OrdersService;

  beforeAll(async () => {
    const { app, server: s } = await createTestingMicroservice({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: {
            processNewOrder: jest.fn(),
            findById: jest.fn().mockResolvedValue({
              id: 'order-1', status: 'shipped',
            }),
            findByUser: jest.fn().mockResolvedValue([
              { id: 'order-1' }, { id: 'order-2' },
            ]),
          },
        },
      ],
    });
    server = s;
    ordersService = app.get(OrdersService);
  });

  it('should process new order events', async () => {
    await server.emit('order.created', {
      orderId: 'order-1',
      userId: 'user-1',
      amount: 99.99,
    });

    expect(ordersService.processNewOrder).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      amount: 99.99,
    });
  });

  it('should query a single order', async () => {
    const result = await server.request('get.order', { id: 'order-1' });
    expect(result).toEqual({ id: 'order-1', status: 'shipped' });
  });

  it('should list orders by user', async () => {
    const result = await server.request('list.orders', { userId: 'user-1' });
    expect(result).toHaveLength(2);
  });
});
```

## Recipe 2: Testing Global Guards

Apply a global guard to all handlers:

```ts
@Injectable()
class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const data = context.switchToRpc().getData();
    return data?._apiKey === 'secret-key-123';
  }
}
```

```ts
beforeAll(async () => {
  server = new MemoryServer();

  const module = await Test.createTestingModule({
    controllers: [OrdersController],
  }).compile();

  app = module.createNestMicroservice({ strategy: server });

  // Apply global guard
  app.useGlobalGuards(new ApiKeyGuard());

  await app.init();
});

it('should reject requests without API key', async () => {
  await expect(
    server.request('get.order', { id: '42' }),
  ).rejects.toMatchObject({ status: 'error', message: 'Forbidden resource' });
});

it('should accept requests with valid API key', async () => {
  const result = await server.request('get.order', {
    id: '42',
    _apiKey: 'secret-key-123',
  });
  expect(result).toBeDefined();
});
```

## Recipe 3: Testing Global Interceptors

```ts
@Injectable()
class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
```

```ts
app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

it('should wrap all responses in an envelope', async () => {
  const result = await server.request('get.order', { id: '42' });

  expect(result).toHaveProperty('success', true);
  expect(result).toHaveProperty('data');
  expect(result).toHaveProperty('timestamp');
});
```

## Recipe 4: Testing Global Pipes

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));

it('should reject payloads with extra fields', async () => {
  await expect(
    server.request('create.order', {
      productId: 'prod-1',
      amount: 10,
      hackerField: 'malicious',
    }),
  ).rejects.toMatchObject({ status: 'error' });
});
```

## Recipe 5: Testing Global Exception Filters

```ts
@Catch()
class GlobalExceptionFilter implements RpcExceptionFilter {
  catch(exception: any): Observable<any> {
    const message = exception instanceof RpcException
      ? exception.getError()
      : 'Internal server error';
    return throwError(() => ({
      error: true,
      message,
      timestamp: new Date().toISOString(),
    }));
  }
}
```

```ts
app.useGlobalFilters(new GlobalExceptionFilter());

it('should format all errors consistently', async () => {
  await expect(
    server.request('will.crash', {}),
  ).rejects.toMatchObject({
    error: true,
    message: expect.any(String),
    timestamp: expect.any(String),
  });
});
```

## Recipe 6: Testing Event Handler Side Effects

Events are fire-and-forget. Test them by checking side effects:

```ts
@Controller()
class NotificationsController {
  constructor(private readonly mailer: MailerService) {}

  @EventPattern('user.registered')
  async sendWelcome(@Payload() data: { email: string; name: string }) {
    await this.mailer.send({
      to: data.email,
      subject: `Welcome, ${data.name}!`,
      template: 'welcome',
    });
  }
}
```

```ts
const mockMailer = { send: jest.fn().mockResolvedValue(undefined) };

const { app, server } = await createTestingMicroservice({
  controllers: [NotificationsController],
  providers: [{ provide: MailerService, useValue: mockMailer }],
});

it('should send welcome email on user registration', async () => {
  await server.emit('user.registered', {
    email: 'jane@example.com',
    name: 'Jane',
  });

  expect(mockMailer.send).toHaveBeenCalledWith({
    to: 'jane@example.com',
    subject: 'Welcome, Jane!',
    template: 'welcome',
  });
});
```

## Recipe 7: Testing Multiple Handlers for the Same Event

NestJS allows multiple handlers for the same `@EventPattern`:

```ts
@Controller()
class AnalyticsController {
  @EventPattern('order.created')
  trackAnalytics(@Payload() data: any) {
    // Track in analytics system
  }
}

@Controller()
class InventoryController {
  @EventPattern('order.created')
  updateInventory(@Payload() data: any) {
    // Update inventory counts
  }
}
```

```ts
const { app, server } = await createTestingMicroservice({
  controllers: [AnalyticsController, InventoryController],
});

it('should invoke all handlers for the same event', async () => {
  await server.emit('order.created', { orderId: '123', productId: 'prod-1' });

  // Assert both side effects occurred
});
```

## Recipe 8: Testing with NestJS Modules

Use real NestJS modules for more realistic tests:

```ts
@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService],
})
class OrdersModule {}
```

```ts
const { app, server } = await createTestingMicroservice(OrdersModule);

it('should work with a complete module', async () => {
  const result = await server.request('get.order', { id: '42' });
  expect(result).toBeDefined();
});
```

## Recipe 9: Swapping Transport in Production vs. Test

The key benefit of NestJS microservices is that your handler code is transport-agnostic. Only the bootstrap changes:

```ts
// main.ts -- production with RabbitMQ
const app = await NestFactory.createMicroservice(AppModule, {
  transport: Transport.RMQ,
  options: {
    urls: ['amqp://localhost:5672'],
    queue: 'orders-queue',
    queueOptions: { durable: true },
  },
});

// main.ts -- production with Redis
const app = await NestFactory.createMicroservice(AppModule, {
  transport: Transport.REDIS,
  options: { host: 'localhost', port: 6379 },
});

// test -- swap to MemoryServer
const server = new MemoryServer();
const module = await Test.createTestingModule({
  imports: [AppModule],
}).compile();
const app = module.createNestMicroservice({ strategy: server });
await app.init();
```

Your controllers, services, guards, pipes, interceptors, and filters remain identical.

## Recipe 10: Testing Async Handlers

Handlers can be async (returning Promises):

```ts
@MessagePattern('process.payment')
async processPayment(@Payload() data: PaymentDto) {
  const result = await this.paymentService.charge(data);
  await this.notificationService.sendReceipt(data.email, result);
  return { transactionId: result.id, status: 'completed' };
}
```

```ts
it('should process payment and return transaction', async () => {
  const result = await server.request('process.payment', {
    email: 'jane@example.com',
    amount: 49.99,
    cardToken: 'tok_test_123',
  });

  expect(result).toEqual({
    transactionId: expect.any(String),
    status: 'completed',
  });
});
```

## Recipe 11: Testing Observable-Returning Handlers

Handlers can return Observables (e.g., for streaming or reactive patterns):

```ts
@MessagePattern('get.stream')
getStream(@Payload() data: any): Observable<any> {
  return of({ value: data.input, source: 'observable' });
}
```

```ts
it('should handle Observable return values', async () => {
  const result = await server.request('get.stream', { input: 'test' });
  expect(result).toEqual({ value: 'test', source: 'observable' });
});
```

`request()` internally uses RxJS `lastValueFrom()` to collect the final emitted value.
