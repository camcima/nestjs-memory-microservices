# Usage Guide

## Installation

```bash
npm install --save-dev nestjs-memory-microservice
```

The library has **zero production dependencies**. It requires these peer dependencies (which you almost certainly already have):

```bash
npm install @nestjs/common @nestjs/core @nestjs/microservices rxjs reflect-metadata
```

## Setup

There are two ways to set up `MemoryServer` in your tests.

### Option 1: Manual Setup

This gives you full control over the test module configuration:

```ts
import { Test } from '@nestjs/testing';
import { MemoryServer } from 'nestjs-memory-microservice';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  let server: MemoryServer;
  let app: INestMicroservice;

  beforeAll(async () => {
    server = new MemoryServer();

    const module = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [OrdersService],
    }).compile();

    app = module.createNestMicroservice({ strategy: server });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ... tests
});
```

### Option 2: Convenience Helper

For simpler cases, `createTestingMicroservice` handles the boilerplate:

```ts
import { createTestingMicroservice } from 'nestjs-memory-microservice';
import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  let server: MemoryServer;
  let app: INestMicroservice;

  beforeAll(async () => {
    ({ server, app } = await createTestingMicroservice({
      controllers: [OrdersController],
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  // ... tests
});
```

The helper accepts either `ModuleMetadata` (with `controllers`, `providers`, `imports`) or a module class:

```ts
// With module metadata
const { app, server } = await createTestingMicroservice({
  controllers: [OrdersController],
  providers: [OrdersService, DatabaseService],
  imports: [ConfigModule],
});

// With a module class
const { app, server } = await createTestingMicroservice(OrdersModule);
```

## Testing Event Handlers

Use `server.emit()` to invoke `@EventPattern` handlers:

```ts
@Controller()
class NotificationsController {
  private sent: string[] = [];

  @EventPattern('user.registered')
  async sendWelcome(@Payload() data: { email: string }) {
    this.sent.push(data.email);
  }
}
```

```ts
it('should send welcome email on registration', async () => {
  await server.emit('user.registered', { email: 'jane@example.com' });

  // Assert side effects (database writes, service calls, etc.)
});
```

`emit()` is fire-and-forget:
- Returns `Promise<void>` that resolves when the handler completes
- Does **not** throw for unregistered patterns (logs a warning instead)
- Matches NestJS's built-in event handling behavior

## Testing Request-Response Handlers

Use `server.request()` to invoke `@MessagePattern` handlers and get the response:

```ts
@Controller()
class UsersController {
  @MessagePattern('get.user')
  getUser(@Payload() data: { id: string }) {
    return { id: data.id, name: 'Jane Doe', email: 'jane@example.com' };
  }
}
```

```ts
it('should return user by id', async () => {
  const user = await server.request('get.user', { id: 'user-42' });

  expect(user).toEqual({
    id: 'user-42',
    name: 'Jane Doe',
    email: 'jane@example.com',
  });
});
```

`request()` returns the handler's response:
- Returns `Promise<T>` that resolves with the handler's return value
- **Throws** with a descriptive error for unregistered patterns
- Works with handlers that return plain values, Promises, or Observables

## Pattern Types

### String Patterns

```ts
@EventPattern('order.created')
@MessagePattern('get.order')
```

```ts
await server.emit('order.created', data);
const result = await server.request('get.order', data);
```

### Object Patterns

```ts
@MessagePattern({ cmd: 'createOrder' })
```

```ts
const result = await server.request({ cmd: 'createOrder' }, data);
```

Object patterns are JSON-stringified for lookup, matching NestJS's internal behavior.

## Using @Ctx() for Context

Handlers can access the execution context via `@Ctx()`:

```ts
import { MemoryContext } from 'nestjs-memory-microservice';

@Controller()
class LoggingController {
  @EventPattern('audit.log')
  handleAudit(@Payload() data: any, @Ctx() ctx: MemoryContext) {
    console.log(`Pattern: ${ctx.getPattern()}`);  // 'audit.log'
    console.log(`Args: ${ctx.getArgs()}`);         // ['audit.log']
  }
}
```

`MemoryContext` extends `BaseRpcContext` and provides:
- `getPattern()` -- the matched pattern string
- `getArgs()` -- the raw args array
- `getArgByIndex(index)` -- a specific arg by index

## Providing Dependencies

Use standard NestJS testing module features for dependency injection:

```ts
const { app, server } = await createTestingMicroservice({
  controllers: [OrdersController],
  providers: [
    OrdersService,
    // Mock a database service
    {
      provide: DatabaseService,
      useValue: {
        findOrder: jest.fn().mockResolvedValue({ id: '1', status: 'shipped' }),
        saveOrder: jest.fn().mockResolvedValue(undefined),
      },
    },
  ],
});
```

## Testing with Real Services

Because `MemoryServer` runs through the full pipeline, you can test with real service implementations. Only mock what you need to (external I/O, databases, etc.):

```ts
const module = await Test.createTestingModule({
  controllers: [OrdersController],
  providers: [
    OrdersService,          // Real service
    PaymentService,         // Real service
    {
      provide: StripeClient, // Mock only the external dependency
      useValue: mockStripeClient,
    },
  ],
}).compile();
```

## Lifecycle

1. **Create** `MemoryServer` instance
2. **Compile** test module with your controllers and providers
3. **Create** microservice with `{ strategy: server }`
4. **Init** the app -- NestJS registers and wraps all handlers
5. **Test** -- use `server.emit()` and `server.request()`
6. **Close** the app -- cleans up resources

Always call `app.close()` in `afterAll` to prevent resource leaks.
