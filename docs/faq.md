# FAQ

## General

### What is nestjs-memory-microservice?

An in-memory NestJS custom transport strategy for testing microservice handlers (`@EventPattern`, `@MessagePattern`) through the **full NestJS pipeline** -- guards, interceptors, pipes, and exception filters -- without needing a real message broker.

### Why not just call the handler method directly?

Direct method calls bypass the entire NestJS pipeline:

```ts
// This does NOT test guards, pipes, interceptors, or filters
const result = controller.getOrder({ id: '42' });
```

With `MemoryServer`, your handler is invoked through the same execution path as a real broker message:

```ts
// This runs the full pipeline: guards -> interceptors -> pipes -> handler -> filters
const result = await server.request('get.order', { id: '42' });
```

If you have a guard that checks `context.switchToRpc().getData()`, a direct method call would never trigger it.

### Why not use a real broker in tests?

You can, and sometimes should (for integration/E2E tests against infrastructure). But for most tests:

- Real brokers require running infrastructure (Docker, cloud services)
- They add latency and flakiness to your test suite
- Setup and teardown is complex
- CI/CD pipelines need broker services configured

`MemoryServer` is for fast, reliable pipeline verification -- not a replacement for all broker testing.

### Is this the same as a mock?

No. Mocks simulate behavior. `MemoryServer` runs the **real NestJS pipeline code**. The only thing missing is the network transport -- everything else (dependency injection, pipeline execution, error handling) is real.

### How does this compare to `supertest` for HTTP?

`supertest` lets you test HTTP endpoints through the full Express/Fastify pipeline without running a real server. `MemoryServer` does the same thing for microservice handlers -- tests them through the full RPC pipeline without running a real broker.

| Tool | Protocol | Pipeline | Server required? |
|------|----------|----------|-----------------|
| `supertest` | HTTP | Full Express/Fastify | No |
| `MemoryServer` | RPC | Full NestJS microservice | No |

## Setup

### What are the peer dependencies?

```json
{
  "@nestjs/common": "^10.0.0 || ^11.0.0",
  "@nestjs/core": "^10.0.0 || ^11.0.0",
  "@nestjs/microservices": "^10.0.0 || ^11.0.0",
  "reflect-metadata": "^0.1.13 || ^0.2.0",
  "rxjs": "^7.0.0"
}
```

You almost certainly already have these if you're building a NestJS microservice.

### Does this work with NestJS 10?

Yes. The library supports both NestJS 10 and NestJS 11.

### Does this work with NestJS 11?

Yes. NestJS 11 added abstract methods `on()` and `unwrap()` to the `Server` base class. `MemoryServer` implements both.

### Do I need `class-validator` and `class-transformer`?

Only if you want to test `ValidationPipe` with DTOs. They are not required by `MemoryServer` itself.

## Usage

### Can I use object patterns?

Yes. Both string and object patterns work:

```ts
// String pattern
await server.request('get.order', data);

// Object pattern
await server.request({ cmd: 'getOrder' }, data);
```

Object patterns are JSON-stringified internally, matching NestJS's behavior.

### Can I test `@Ctx()` context?

Yes. Handlers receive a `MemoryContext` instance:

```ts
@EventPattern('order.created')
handle(@Payload() data: any, @Ctx() ctx: MemoryContext) {
  ctx.getPattern();  // 'order.created'
  ctx.getArgs();     // ['order.created']
}
```

### Can I use global guards/pipes/interceptors/filters?

Yes. Apply them via `app.useGlobal*()` before calling `app.init()`:

```ts
const app = module.createNestMicroservice({ strategy: server });
app.useGlobalGuards(new MyGuard());
app.useGlobalPipes(new ValidationPipe());
app.useGlobalInterceptors(new MyInterceptor());
app.useGlobalFilters(new MyFilter());
await app.init();
```

### Can I use dependency injection in guards/interceptors?

Yes, if you register them via the module system instead of `app.useGlobal*()`:

```ts
@Module({
  controllers: [OrdersController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    AuthService, // Injected into AuthGuard
  ],
})
class AppModule {}
```

### Does `emit()` wait for the handler to complete?

Yes. `emit()` returns a `Promise<void>` that resolves when the handler finishes. This is different from real brokers where `emit` is truly fire-and-forget. This makes it easier to test side effects synchronously.

### Does `emit()` throw if the handler throws?

No. `emit()` delegates to `Server.handleEvent()`, which catches errors internally. This matches NestJS's event handling behavior.

### What happens if I emit to an unregistered pattern?

Nothing. `emit()` resolves normally. NestJS logs a warning internally.

### What happens if I request an unregistered pattern?

`request()` throws an `Error` with a message listing all registered patterns:

```
No handler found for pattern: "unknown.pattern". Registered patterns: [get.order, create.order]
```

## Error Handling

### Why do errors reject with plain objects instead of Error instances?

This is how NestJS microservices work. Errors must be serializable for transport over a broker, so NestJS converts them to plain objects. `MemoryServer` preserves this behavior so your tests match production.

### Why doesn't `.rejects.toThrow()` work for guard rejections?

`.toThrow()` expects an `Error` instance, but NestJS microservice errors are plain objects. Use `.rejects.toMatchObject()` instead:

```ts
// Correct
await expect(
  server.request('admin.action', { role: 'user' }),
).rejects.toMatchObject({ status: 'error', message: 'Forbidden resource' });
```

See [Error Handling](error-handling.md) for details.

## Troubleshooting

### My handler is not being found

Check that:
1. The controller is included in the test module's `controllers` array
2. The pattern in `emit()`/`request()` exactly matches the `@EventPattern`/`@MessagePattern` decorator
3. For object patterns, the property order and values match exactly
4. You called `await app.init()` before testing

### My guard/pipe/interceptor isn't running

Check that:
1. The decorator is applied to the handler method (not just the class, unless you want class-level scope)
2. For global pipeline features, they are applied before `app.init()`
3. You're using the correct assertion approach for errors (see Error Handling)

### Tests pass but my handler has side effects I can't see

For `@EventPattern` handlers, you need to check side effects explicitly -- `emit()` returns `void`. Assert against mocked services, in-memory state, or other observable effects.

### I get "Cannot determine a type" errors with ValidationPipe

Ensure you have:
- `emitDecoratorMetadata: true` in your `tsconfig.json`
- `experimentalDecorators: true` in your `tsconfig.json`
- `class-validator` and `class-transformer` installed

## Production

### Should I use MemoryServer in production?

No. `MemoryServer` is a testing tool. In production, use your real transport (RabbitMQ, Redis, NATS, Kafka, etc.). The handler code is identical -- only the transport configuration changes.

### Does my handler code need to change between MemoryServer and a real broker?

No. Your controllers, decorators, DTOs, guards, pipes, interceptors, and filters are exactly the same. Only the bootstrap configuration changes:

```ts
// Production
const app = await NestFactory.createMicroservice(AppModule, {
  transport: Transport.RMQ,
  options: { /* ... */ },
});

// Test
const server = new MemoryServer();
const app = module.createNestMicroservice({ strategy: server });
```
