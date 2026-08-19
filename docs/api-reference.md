# API Reference

## MemoryServer

The core class. Extends `Server` from `@nestjs/microservices` and implements `CustomTransportStrategy`.

```ts
import { MemoryServer } from '@camcima/nestjs-memory-microservices';
```

### Constructor

```ts
const server = new MemoryServer();
```

No arguments. The server starts empty and handlers are registered when NestJS initializes the microservice app.

### Properties

#### `transportId`

```ts
readonly transportId: symbol
```

A unique symbol (`MEMORY_TRANSPORT`) identifying this transport. Used internally by NestJS.

### Methods

#### `emit(pattern, data)`

```ts
async emit(pattern: MsPattern, data: any): Promise<void>
```

Fire-and-forget: invokes all `@EventPattern` handlers for the given pattern through the full NestJS pipeline.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `MsPattern` (`string \| number \| object`) | The event pattern to match |
| `data` | `any` | The payload to pass to the handler |

**Returns:** `Promise<void>` that resolves once every matching handler has completed.

**Behavior:**
- Waits for the handler to finish -- including handlers wrapped by interceptors and every handler chained onto the same pattern
- Resolves normally even if no handler is registered (matches NestJS behavior -- logs an error)
- Resolves normally even if the handler throws (events are fire-and-forget); the error still passes through your exception filters
- Object pattern keys are sorted during normalization, so key order does not affect matching
- The handler receives the full NestJS pipeline (guards, interceptors, pipes, filters)

**Examples:**

```ts
// String pattern
await server.emit('order.created', { orderId: '123', amount: 49.99 });

// Object pattern -- key order is irrelevant
await server.emit({ event: 'user.registered' }, { userId: '456' });

// Unregistered pattern -- resolves without error
await server.emit('unknown.event', {});
```

---

#### `request(pattern, data)`

```ts
async request<T = any>(pattern: MsPattern, data: any): Promise<T>
```

Request-response: invokes the `@MessagePattern` handler for the given pattern and returns the result.

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | `MsPattern` (`string \| number \| object`) | The message pattern to match |
| `data` | `any` | The payload to pass to the handler |

**Returns:** `Promise<T>` that resolves with the handler's return value.

**Throws:**
- `Error` if no handler is registered for the pattern. The error message includes the normalized route and lists all registered routes for debugging.
- `Error` if the pattern resolves to an `@EventPattern` handler, which returns no response -- use `emit()` for those.
- Rejects with a plain object if the handler or pipeline produces an error (see [Error Handling](error-handling.md)).

**Examples:**

```ts
// String pattern
const order = await server.request('get.order', { id: 'order-42' });

// Object pattern -- key order is irrelevant
const result = await server.request({ cmd: 'createOrder' }, { amount: 99 });

// Numeric pattern
const pong = await server.request(42, {});

// Typed response
interface Order { orderId: string; status: string; }
const order = await server.request<Order>('get.order', { id: '42' });

// Handling errors
await expect(
  server.request('admin.action', { role: 'user' }),
).rejects.toMatchObject({ status: 'error' });
```

---

#### `listen(callback)`

```ts
listen(callback: () => void): void
```

Called by NestJS during microservice bootstrap. Signals that the transport is ready immediately by invoking the callback synchronously.

You do not call this method directly.

---

#### `close()`

```ts
close(): void
```

Called by NestJS during microservice shutdown. Clears all registered message handlers.

You do not call this method directly -- it is invoked via `app.close()`.

Because the handler map is cleared, a `MemoryServer` instance cannot be reused across
app lifecycles. If a test closes the app, create a new `MemoryServer` for the next one.

---

#### `on(event, callback)`

```ts
on<EventKey extends string, EventCallback extends Function>(
  event: EventKey,
  callback: EventCallback,
): void
```

No-op implementation. Real transports use this for connection events (`'connect'`, `'disconnect'`). Since `MemoryServer` has no connection, this is a no-op.

---

#### `unwrap()`

```ts
unwrap<T>(): T
```

Returns the server instance. Required by NestJS 11's `Server` abstract class.

---

## MemoryContext

Extends `BaseRpcContext` from `@nestjs/microservices`. Passed to handlers via the `@Ctx()` decorator.

```ts
import { MemoryContext } from '@camcima/nestjs-memory-microservices';
```

### Constructor

```ts
new MemoryContext(args: [string])
```

You don't construct this directly -- `MemoryServer` creates it for each invocation.

### Methods

#### `getPattern()`

```ts
getPattern(): string
```

Returns the normalized pattern string (the route) for the current invocation. Object
patterns appear with their keys sorted, matching how NestJS registered them.

```ts
@EventPattern('order.created')
handle(@Ctx() ctx: MemoryContext) {
  ctx.getPattern(); // 'order.created'
}

@MessagePattern({ cmd: 'getOrder' })
handle(@Ctx() ctx: MemoryContext) {
  ctx.getPattern(); // '{"cmd":"getOrder"}'
}

@MessagePattern({ scope: 'orders', cmd: 'archive' })
handle(@Ctx() ctx: MemoryContext) {
  ctx.getPattern(); // '{"cmd":"archive","scope":"orders"}' -- keys sorted
}
```

#### `getArgs()`

```ts
getArgs(): [string]
```

Returns the raw args array. For `MemoryContext`, this is always a single-element array containing the pattern string.

#### `getArgByIndex(index)`

```ts
getArgByIndex(index: number): string | undefined
```

Returns the argument at the given index. Index `0` returns the pattern string.

---

## MEMORY_TRANSPORT

```ts
import { MEMORY_TRANSPORT } from '@camcima/nestjs-memory-microservices';
```

A `Symbol` used as the `transportId` for `MemoryServer`. You can use this if you need to identify the transport type programmatically.

---

## createTestingMicroservice(moduleOrMetadata)

```ts
import { createTestingMicroservice } from '@camcima/nestjs-memory-microservices';
```

Convenience function that wraps the boilerplate of creating a `MemoryServer`, compiling the test module, and initializing the microservice.

```ts
async function createTestingMicroservice(
  moduleOrMetadata: Type<any> | ModuleMetadata,
): Promise<TestingMicroserviceResult>
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `moduleOrMetadata` | `Type<any> \| ModuleMetadata` | A module class or metadata object with `controllers`, `providers`, `imports` |

**Returns:** `Promise<{ app: INestMicroservice, server: MemoryServer }>`

**Examples:**

```ts
// With module metadata
const { app, server } = await createTestingMicroservice({
  controllers: [OrdersController],
  providers: [OrdersService],
});

// With a module class
const { app, server } = await createTestingMicroservice(OrdersModule);

// Always close when done
await app.close();
```

---

## TestingMicroserviceResult

```ts
import { TestingMicroserviceResult } from '@camcima/nestjs-memory-microservices';
```

The return type of `createTestingMicroservice`:

```ts
interface TestingMicroserviceResult {
  app: INestMicroservice;
  server: MemoryServer;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `app` | `INestMicroservice` | The NestJS microservice instance (call `app.close()` when done) |
| `server` | `MemoryServer` | The `MemoryServer` instance to emit events and send requests |

---

## MemoryContextArgs

```ts
import { MemoryContextArgs } from '@camcima/nestjs-memory-microservices';
```

Type alias for the `MemoryContext` args tuple:

```ts
type MemoryContextArgs = [string];
```

Useful if you need to type the context args explicitly.
