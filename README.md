# nestjs-memory-microservice

An in-memory NestJS microservice transport for testing. Full pipeline, zero broker.

## The Problem

Testing `@nestjs/microservices` handlers is painful:

| Approach | Guards | Pipes | Interceptors | Filters | Broker needed? |
|----------|--------|-------|--------------|---------|----------------|
| Direct method call | No | No | No | No | No |
| `ClientProxy` + emulator | Yes | Yes | Yes | Yes | **Yes** |
| **MemoryServer** | **Yes** | **Yes** | **Yes** | **Yes** | **No** |

- **Direct method calls** bypass the entire NestJS pipeline — you're testing a function, not your microservice
- **Real brokers / emulators** are slow, require infrastructure, and return async fire-and-forget results you can't inspect
- There's no `supertest` equivalent for microservices

## How This Solves It

`MemoryServer` is a custom transport strategy that extends `@nestjs/microservices`' `Server` base class. The `Server` class stores handler functions that are **already wrapped** with the full NestJS pipeline (guards, interceptors, pipes, exception filters). `MemoryServer` simply invokes them in-process — no network, no broker, no emulator.

Your handlers use **standard NestJS decorators** (`@EventPattern`, `@MessagePattern`, `@Payload`, `@Ctx`). Zero vendor lock-in.

## Installation

```bash
npm install --save-dev nestjs-memory-microservice
```

**Peer dependencies** (you probably already have these):

```bash
npm install @nestjs/common @nestjs/core @nestjs/microservices rxjs reflect-metadata
```

## Quick Start

### 1. Define handlers with standard NestJS decorators

```ts
import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload, Ctx } from '@nestjs/microservices';

@Controller()
export class OrdersController {
  @EventPattern('order.created')
  handleOrderCreated(@Payload() data: { orderId: string; amount: number }) {
    console.log(`Order ${data.orderId} created`);
  }

  @MessagePattern('get.order')
  getOrder(@Payload() data: { id: string }) {
    return { orderId: data.id, status: 'shipped' };
  }
}
```

### 2. Test with MemoryServer

```ts
import { Test } from '@nestjs/testing';
import { MemoryServer } from 'nestjs-memory-microservice';
import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  let server: MemoryServer;

  beforeAll(async () => {
    server = new MemoryServer();
    const module = await Test.createTestingModule({
      controllers: [OrdersController],
    }).compile();
    const app = module.createNestMicroservice({ strategy: server });
    await app.init();
  });

  it('should handle events', async () => {
    // Fire-and-forget — runs through the full pipeline
    await server.emit('order.created', { orderId: '123', amount: 49.99 });
  });

  it('should handle request-response', async () => {
    // Returns the handler's response
    const result = await server.request('get.order', { id: 'order-42' });
    expect(result).toEqual({ orderId: 'order-42', status: 'shipped' });
  });
});
```

### 3. Or use the convenience helper

```ts
import { createTestingMicroservice } from 'nestjs-memory-microservice';
import { OrdersController } from './orders.controller';

const { app, server } = await createTestingMicroservice({
  controllers: [OrdersController],
});

await server.emit('order.created', { orderId: '123', amount: 49.99 });
const result = await server.request('get.order', { id: 'order-42' });

await app.close();
```

## Production Usage

In production, use your real transport. The handler code is identical — only the bootstrap changes:

```ts
// main.ts — production
const app = await NestFactory.createMicroservice(AppModule, {
  transport: Transport.RMQ,
  options: { urls: ['amqp://localhost:5672'], queue: 'orders' },
});

// test — swap to MemoryServer, no broker needed
const server = new MemoryServer();
const app = module.createNestMicroservice({ strategy: server });
```

## Full Pipeline Verification

The integration tests prove that the complete NestJS pipeline executes:

### Guards

```ts
@Injectable()
class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const data = context.switchToRpc().getData();
    return data?.role === 'admin';
  }
}

@UseGuards(AdminGuard)
@MessagePattern('admin.action')
adminAction(@Payload() data: any) {
  return { executed: true };
}

// Test: guard blocks non-admin
await expect(
  server.request('admin.action', { role: 'user' }),
).rejects.toMatchObject({ status: 'error', message: 'Forbidden resource' });

// Test: guard allows admin
const result = await server.request('admin.action', { role: 'admin' });
expect(result).toEqual({ executed: true });
```

### Validation Pipes

```ts
class CreateOrderDto {
  @IsString() productId!: string;
  @IsNumber() @Min(0.01) amount!: number;
}

@UsePipes(new ValidationPipe({ whitelist: true }))
@MessagePattern('create.order')
createOrder(@Payload() data: CreateOrderDto) {
  return { orderId: 'new-001', ...data };
}

// Test: validation rejects invalid payload
await expect(
  server.request('create.order', { amount: 'not-a-number' }),
).rejects.toMatchObject({ status: 'error' });

// Test: validation passes and whitelist strips extra fields
const result = await server.request('create.order', {
  productId: 'prod-1', amount: 10, extra: 'stripped',
});
expect(result).not.toHaveProperty('extra');
```

### Interceptors

```ts
@UseInterceptors(TransformInterceptor)
@MessagePattern('transformed.action')
handle(@Payload() data: any) {
  return { value: data.input };
}

// Test: interceptor transforms the response
const result = await server.request('transformed.action', { input: 'hello' });
expect(result).toEqual({ data: { value: 'hello' }, transformed: true });
```

### Exception Filters

```ts
@Catch(RpcException)
class CustomFilter extends BaseRpcExceptionFilter {
  catch(exception: RpcException, _host: ArgumentsHost): Observable<any> {
    return throwError(() => ({
      customError: true,
      message: exception.getError(),
      code: 'CUSTOM_ERROR',
    }));
  }
}

@UseFilters(new CustomFilter())
@MessagePattern('will.throw')
throwError(@Payload() data: any): never {
  throw new RpcException(`Order ${data.id} not found`);
}

// Test: custom filter transforms the error
await expect(
  server.request('will.throw', { id: '42' }),
).rejects.toEqual({
  customError: true,
  message: 'Order 42 not found',
  code: 'CUSTOM_ERROR',
});
```

## API Reference

### `MemoryServer`

| Method | Description |
|--------|-------------|
| `emit(pattern, data)` | Fire-and-forget: invokes `@EventPattern` handlers through the full pipeline |
| `request(pattern, data)` | Request-response: invokes `@MessagePattern` handler and returns the result |
| `listen(callback)` | Called by NestJS during bootstrap — signals ready immediately |
| `close()` | Clears all registered handlers |

- `pattern` can be a string (`'order.created'`) or an object (`{ cmd: 'getOrder' }`)
- `emit()` does not throw for unregistered patterns (matches NestJS behavior — logs a warning)
- `request()` throws with a descriptive error for unregistered patterns

### `MemoryContext`

Extends `BaseRpcContext`. Available via `@Ctx()` in handlers.

| Method | Description |
|--------|-------------|
| `getPattern()` | Returns the matched pattern string |
| `getArgs()` | Returns the raw args array |
| `getArgByIndex(index)` | Returns a specific arg |

### `createTestingMicroservice(metadata)`

Convenience function that creates a `MemoryServer`, compiles the test module, and initializes the microservice.

```ts
const { app, server } = await createTestingMicroservice({
  controllers: [OrdersController],
  providers: [OrdersService],
});
```

Returns `{ app: INestMicroservice, server: MemoryServer }`.

## Error Handling

Errors from the NestJS pipeline (guards, pipes, exception filters) are returned as **rejected promises** with plain objects, not `Error` instances. This matches how NestJS microservices serialize errors for transport:

```ts
// Typical error shape:
{ status: 'error', message: 'Forbidden resource' }     // guard rejection
{ status: 'error', message: ['validation error...'] }   // validation failure
```

Custom exception filters can return any shape via `throwError(() => customObject)`.

## Compatibility

| Dependency | Version |
|-----------|---------|
| Node.js | >= 18.0.0 |
| NestJS | ^10.0.0 \|\| ^11.0.0 |
| TypeScript | >= 5.0 |
| RxJS | ^7.0.0 |

## License

MIT
