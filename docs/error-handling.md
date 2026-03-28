# Error Handling

## How Errors Work in NestJS Microservices

NestJS microservices handle errors differently from HTTP applications. Because microservice responses must be serializable for transport over a broker, errors are returned as **plain objects**, not `Error` instances.

This is a fundamental NestJS design decision, not specific to `MemoryServer`. The same behavior occurs with RabbitMQ, Redis, NATS, etc.

## Error Shapes

### Guard Rejection

When a guard returns `false`, NestJS produces:

```ts
{
  status: 'error',
  message: 'Forbidden resource'
}
```

### Validation Failure (ValidationPipe)

When `ValidationPipe` rejects a payload:

```ts
{
  status: 'error',
  message: [
    'productId must be a string',
    'amount must not be less than 0.01'
  ]
}
```

The `message` field is an array of validation error strings.

### RpcException

When a handler throws `RpcException`:

```ts
throw new RpcException('Order not found');
```

Produces:

```ts
{
  status: 'error',
  message: 'Order not found'
}
```

### RpcException with Object

```ts
throw new RpcException({ message: 'Not found', code: 'ORDER_NOT_FOUND' });
```

Produces:

```ts
{
  status: 'error',
  message: { message: 'Not found', code: 'ORDER_NOT_FOUND' }
}
```

### Custom Exception Filter

Custom filters can return any shape:

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
```

Produces exactly what you return from `throwError()`:

```ts
{
  customError: true,
  message: 'Cannot process order 99',
  code: 'CUSTOM_ERROR'
}
```

### Generic Error (non-RpcException)

When a handler throws a standard `Error`:

```ts
throw new Error('Unexpected failure');
```

NestJS's default exception filter catches it and returns an error object. The exact shape depends on the NestJS version but it will always be a rejected promise with a defined value.

## Testing Errors

### Use `.rejects`, Not `.toThrow()`

Because pipeline errors are plain objects (not `Error` instances), use `.rejects.toMatchObject()` or `.rejects.toEqual()`, **not** `.rejects.toThrow()`:

```ts
// CORRECT -- match against the plain object
await expect(
  server.request('admin.action', { role: 'user' }),
).rejects.toMatchObject({
  status: 'error',
  message: 'Forbidden resource',
});

// CORRECT -- exact match
await expect(
  server.request('filtered.action', { id: '99' }),
).rejects.toEqual({
  customError: true,
  message: 'Cannot process 99',
  code: 'CUSTOM_ERROR',
});

// WRONG -- .toThrow() expects an Error instance
await expect(
  server.request('admin.action', { role: 'user' }),
).rejects.toThrow();  // May not work as expected
```

### Partial Matching

Use `.toMatchObject()` when you only care about certain fields:

```ts
await expect(
  server.request('create.order', { amount: 'bad' }),
).rejects.toMatchObject({
  status: 'error',
});
```

### Checking That an Error Exists

Use `.rejects.toBeDefined()` for a loose check:

```ts
await expect(
  server.request('will.crash', {}),
).rejects.toBeDefined();
```

## Unregistered Pattern Errors

### `emit()` -- Silent

`emit()` does not throw for unregistered patterns. This matches NestJS behavior where events are fire-and-forget:

```ts
// Resolves normally, even though no handler exists
await server.emit('unknown.event', { data: 'test' });
```

### `request()` -- Throws

`request()` throws a standard `Error` (not a plain object) for unregistered patterns. This error includes debugging information:

```ts
await expect(
  server.request('unknown.pattern', {}),
).rejects.toThrow('No handler found for pattern: "unknown.pattern"');
```

The error message also lists all registered patterns:

```
No handler found for pattern: "unknown.pattern". Registered patterns: [get.order, create.order, admin.action]
```

This is a `MemoryServer`-specific error (not from the NestJS pipeline), so it is an actual `Error` instance and `.toThrow()` works here.

## Summary Table

| Source | Error Type | Assert With |
|--------|-----------|-------------|
| Guard rejection | `{ status: 'error', message: '...' }` | `.rejects.toMatchObject()` |
| ValidationPipe | `{ status: 'error', message: [...] }` | `.rejects.toMatchObject()` |
| RpcException | `{ status: 'error', message: '...' }` | `.rejects.toMatchObject()` |
| Custom filter | Any shape you define | `.rejects.toEqual()` |
| Generic Error | Error object | `.rejects.toBeDefined()` |
| Unregistered pattern (request) | `Error` instance | `.rejects.toThrow()` |
| Unregistered pattern (emit) | No error | `.resolves.toBeUndefined()` |
