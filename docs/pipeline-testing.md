# Full Pipeline Testing

The primary reason `MemoryServer` exists is to test your handlers through the **full NestJS microservice pipeline** -- not just the handler method itself. This page shows how to test each pipeline layer.

## Guards

Guards control access to handlers. In microservices, guards use `context.switchToRpc()` (not `switchToHttp()`).

### Define a Guard

```ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const data = context.switchToRpc().getData();
    return data?.role === 'admin';
  }
}
```

### Apply It

```ts
@Controller()
class AdminController {
  @UseGuards(AdminGuard)
  @MessagePattern('admin.action')
  adminAction(@Payload() data: any) {
    return { executed: true };
  }
}
```

### Test It

```ts
it('should allow admin access', async () => {
  const result = await server.request('admin.action', {
    role: 'admin',
    action: 'delete-user',
  });
  expect(result).toEqual({ executed: true });
});

it('should block non-admin access', async () => {
  await expect(
    server.request('admin.action', { role: 'user' }),
  ).rejects.toMatchObject({
    status: 'error',
    message: 'Forbidden resource',
  });
});
```

Guard rejections produce `{ status: 'error', message: 'Forbidden resource' }`. See [Error Handling](error-handling.md) for details.

## Validation Pipes

`ValidationPipe` with `class-validator` works exactly as in production.

### Define a DTO

```ts
import { IsString, IsNumber, Min } from 'class-validator';

class CreateOrderDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}
```

### Apply ValidationPipe

```ts
@Controller()
class OrdersController {
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @MessagePattern('create.order')
  createOrder(@Payload() data: CreateOrderDto) {
    return { orderId: 'new-001', productId: data.productId, amount: data.amount };
  }
}
```

### Test Validation

```ts
it('should accept valid payloads', async () => {
  const result = await server.request('create.order', {
    productId: 'prod-123',
    amount: 49.99,
  });
  expect(result).toEqual({
    orderId: 'new-001',
    productId: 'prod-123',
    amount: 49.99,
  });
});

it('should reject missing required fields', async () => {
  await expect(
    server.request('create.order', { amount: 49.99 }),
  ).rejects.toMatchObject({ status: 'error' });
});

it('should reject wrong types', async () => {
  await expect(
    server.request('create.order', { productId: 'prod-1', amount: 'not-a-number' }),
  ).rejects.toMatchObject({ status: 'error' });
});

it('should enforce min constraint', async () => {
  await expect(
    server.request('create.order', { productId: 'prod-1', amount: 0 }),
  ).rejects.toMatchObject({ status: 'error' });
});

it('should strip unknown properties with whitelist', async () => {
  const result = await server.request('create.order', {
    productId: 'prod-1',
    amount: 10,
    extraField: 'should-be-stripped',
  });
  expect(result).not.toHaveProperty('extraField');
});
```

To use `ValidationPipe`, install `class-validator` and `class-transformer`:

```bash
npm install --save-dev class-validator class-transformer
```

## Interceptors

Interceptors wrap handler execution with before/after logic and can transform responses.

### Timing Interceptor (Before/After)

```ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    console.log('Before handler...');
    const start = Date.now();
    return next.handle().pipe(
      tap(() => console.log(`After handler (${Date.now() - start}ms)`)),
    );
  }
}
```

### Response Transformation Interceptor

```ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
class WrapResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => ({ data, transformed: true })),
    );
  }
}
```

### Apply and Test

```ts
@Controller()
class ItemsController {
  @UseInterceptors(WrapResponseInterceptor)
  @MessagePattern('get.item')
  getItem(@Payload() data: any) {
    return { name: data.name };
  }
}
```

```ts
it('should transform the response via interceptor', async () => {
  const result = await server.request('get.item', { name: 'Widget' });

  expect(result).toEqual({
    data: { name: 'Widget' },
    transformed: true,
  });
});
```

### Testing Execution Order

```ts
const log: string[] = [];

@Injectable()
class OrderTrackingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    log.push('before');
    return next.handle().pipe(tap(() => log.push('after')));
  }
}

// In the handler:
// log.push('handler');

it('should execute in correct order', async () => {
  await server.request('tracked.action', {});
  expect(log).toEqual(['before', 'handler', 'after']);
});
```

## Exception Filters

Exception filters catch errors and transform them into responses.

### Default RpcException Handling

Without a custom filter, `RpcException` produces:

```ts
@MessagePattern('will.throw')
throwError(@Payload() data: any): never {
  throw new RpcException(`Order ${data.id} not found`);
}
```

```ts
it('should propagate RpcException', async () => {
  await expect(
    server.request('will.throw', { id: '42' }),
  ).rejects.toMatchObject({
    status: 'error',
    message: 'Order 42 not found',
  });
});
```

### Custom Exception Filter

```ts
import { Catch, ArgumentsHost } from '@nestjs/common';
import { RpcException, BaseRpcExceptionFilter } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

@Catch(RpcException)
class CustomRpcFilter extends BaseRpcExceptionFilter {
  catch(exception: RpcException, _host: ArgumentsHost): Observable<any> {
    return throwError(() => ({
      customError: true,
      message: exception.getError(),
      code: 'CUSTOM_ERROR',
    }));
  }
}
```

```ts
@UseFilters(new CustomRpcFilter())
@MessagePattern('filtered.action')
doSomething(@Payload() data: any): never {
  throw new RpcException(`Cannot process ${data.id}`);
}
```

```ts
it('should use custom filter to transform the error', async () => {
  await expect(
    server.request('filtered.action', { id: '99' }),
  ).rejects.toEqual({
    customError: true,
    message: 'Cannot process 99',
    code: 'CUSTOM_ERROR',
  });
});
```

### Generic Errors

Non-`RpcException` errors are also caught:

```ts
@MessagePattern('will.crash')
crash(): never {
  throw new Error('Unexpected failure');
}
```

```ts
it('should propagate generic errors', async () => {
  await expect(
    server.request('will.crash', {}),
  ).rejects.toBeDefined();
});
```

## Combining Multiple Pipeline Features

You can stack all pipeline features on a single handler:

```ts
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor, TransformInterceptor)
@UsePipes(new ValidationPipe({ whitelist: true }))
@UseFilters(new CustomExceptionFilter())
@MessagePattern('orders.create')
async createOrder(@Payload() dto: CreateOrderDto, @Ctx() ctx: MemoryContext) {
  return this.ordersService.create(dto);
}
```

```ts
it('should execute the full pipeline', async () => {
  // Guard passes, pipe validates, interceptor wraps, handler executes
  const result = await server.request('orders.create', {
    role: 'admin',
    productId: 'prod-1',
    amount: 99.99,
  });
  expect(result).toHaveProperty('data');
  expect(result).toHaveProperty('transformed', true);
});

it('should fail at the guard layer', async () => {
  await expect(
    server.request('orders.create', { role: 'guest', productId: 'prod-1', amount: 10 }),
  ).rejects.toMatchObject({ status: 'error', message: 'Forbidden resource' });
});

it('should fail at the validation layer', async () => {
  await expect(
    server.request('orders.create', { role: 'admin', amount: 'bad' }),
  ).rejects.toMatchObject({ status: 'error' });
});
```

The pipeline executes in order: guards -> interceptors (before) -> pipes -> handler -> interceptors (after). If any layer rejects, subsequent layers are skipped, and exception filters handle the error.
