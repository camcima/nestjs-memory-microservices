<div align="center">

<picture>
  <img alt="nestjs-memory-microservices" src="assets/logo.svg" width="960">
</picture>

<br>

[![CI](https://github.com/camcima/nestjs-memory-microservices/actions/workflows/ci.yml/badge.svg)](https://github.com/camcima/nestjs-memory-microservices/actions/workflows/ci.yml)
[![CodeQL](https://github.com/camcima/nestjs-memory-microservices/actions/workflows/codeql.yml/badge.svg)](https://github.com/camcima/nestjs-memory-microservices/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/camcima/nestjs-memory-microservices/graph/badge.svg)](https://codecov.io/gh/camcima/nestjs-memory-microservice)
[![npm version](https://img.shields.io/npm/v/@camcima/nestjs-memory-microservices)](https://www.npmjs.com/package/@camcima/nestjs-memory-microservices)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%20%7C%2020%20%7C%2022-green.svg)](https://nodejs.org/)

</div>

An in-memory NestJS microservice transport for testing. Full pipeline, zero broker.

## The Problem

Testing `@nestjs/microservices` handlers is painful:

| Approach | Guards | Pipes | Interceptors | Filters | Broker needed? |
|----------|--------|-------|--------------|---------|----------------|
| Direct method call | No | No | No | No | No |
| `ClientProxy` + emulator | Yes | Yes | Yes | Yes | **Yes** |
| **MemoryServer** | **Yes** | **Yes** | **Yes** | **Yes** | **No** |

- **Direct method calls** bypass the entire NestJS pipeline -- you're testing a function, not your microservice.
- **Real brokers / emulators** are slow, require infrastructure, and return async fire-and-forget results you can't inspect.
- There's no `supertest` equivalent for microservices.

## How It Works

`MemoryServer` is a custom transport strategy that extends `@nestjs/microservices`' `Server` base class. The `Server` class stores handler functions that are **already wrapped** with the full NestJS pipeline (guards, interceptors, pipes, exception filters). `MemoryServer` simply invokes them in-process -- no network, no broker, no emulator.

Your handlers use **standard NestJS decorators** (`@EventPattern`, `@MessagePattern`, `@Payload`, `@Ctx`). Zero vendor lock-in.

## Installation

```bash
npm install --save-dev @camcima/nestjs-memory-microservices
```

**Peer dependencies** (you probably already have these):

```bash
npm install @nestjs/common @nestjs/core @nestjs/microservices rxjs reflect-metadata
```

## Quick Start

```ts
import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class OrdersController {
  @EventPattern('order.created')
  handleOrderCreated(@Payload() data: { orderId: string; amount: number }) {
    console.log(`Order ${data.orderId} created for $${data.amount}`);
  }

  @MessagePattern('get.order')
  getOrder(@Payload() data: { id: string }) {
    return { orderId: data.id, status: 'shipped' };
  }
}
```

```ts
import { Test } from '@nestjs/testing';
import { MemoryServer } from '@camcima/nestjs-memory-microservices';
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

  it('handles events', async () => {
    await server.emit('order.created', { orderId: '123', amount: 49.99 });
  });

  it('handles request-response', async () => {
    const result = await server.request('get.order', { id: 'order-42' });
    expect(result).toEqual({ orderId: 'order-42', status: 'shipped' });
  });
});
```

Or use the convenience helper:

```ts
import { createTestingMicroservice } from '@camcima/nestjs-memory-microservices';

const { app, server } = await createTestingMicroservice({
  controllers: [OrdersController],
});

await server.emit('order.created', { orderId: '123', amount: 49.99 });
const result = await server.request('get.order', { id: 'order-42' });

await app.close();
```

## Documentation

- [How It Works](docs/how-it-works.md) -- architecture and internals
- [Usage Guide](docs/usage-guide.md) -- setup, patterns, and best practices
- [Full Pipeline Testing](docs/pipeline-testing.md) -- guards, pipes, interceptors, exception filters
- [API Reference](docs/api-reference.md) -- complete API documentation
- [Error Handling](docs/error-handling.md) -- how errors are surfaced and tested
- [Recipes](docs/recipes.md) -- common testing patterns and real-world examples
- [FAQ](docs/faq.md) -- frequently asked questions

## Production Usage

In production, use your real transport. The handler code is identical -- only the bootstrap changes:

```ts
// main.ts -- production
const app = await NestFactory.createMicroservice(AppModule, {
  transport: Transport.RMQ,
  options: { urls: ['amqp://localhost:5672'], queue: 'orders' },
});

// test -- swap to MemoryServer, no broker needed
const server = new MemoryServer();
const app = module.createNestMicroservice({ strategy: server });
```

## Compatibility

| Dependency | Version |
|-----------|---------|
| Node.js | >= 18.0.0 |
| NestJS | ^10.0.0 \|\| ^11.0.0 |
| TypeScript | >= 5.0 |
| RxJS | ^7.0.0 |

## Security

### CI

| Tool | Purpose | Trigger |
|------|---------|---------|
| **CodeQL** | Static analysis for security vulnerabilities | Push/PR to `main`, weekly schedule |
| **OSV-Scanner** | Dependency vulnerability scanning (production deps only) | Push/PR to `main` |
| **Dependabot** | Automated dependency and GitHub Actions updates | Weekly |

### Local (via Lefthook)

**Gitleaks** runs automatically on every commit (`pre-commit`) to catch secrets before they reach the remote.

Prerequisites: install [Gitleaks](https://github.com/gitleaks/gitleaks#installing).

### Manual commands

```bash
# Dependency audit (production deps only)
npm run security:audit

# Secret scanning
npm run security:secrets
```

### Optional: Semgrep

[Semgrep](https://semgrep.dev/) can be used for additional local code-security scanning. It is not included in the default hooks to keep the local workflow lightweight, but can be run on demand:

```bash
# Install: https://semgrep.dev/docs/getting-started/
semgrep scan --config auto src/
```

## License

MIT
