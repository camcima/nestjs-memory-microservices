import {
  Controller,
  INestMicroservice,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UseInterceptors,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Observable, map, tap } from 'rxjs';
import { MemoryServer } from '../../src/memory-server';

const interceptorLog: string[] = [];

@Injectable()
class TimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    interceptorLog.push('before');
    return next.handle().pipe(
      tap(() => interceptorLog.push('after')),
    );
  }
}

@Injectable()
class TransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => ({ data, transformed: true, timestamp: '2026-01-01' })),
    );
  }
}

@Controller()
class InterceptedController {
  @UseInterceptors(TimingInterceptor)
  @MessagePattern('timed.action')
  timedAction(@Payload() data: any) {
    interceptorLog.push('handler');
    return { result: data.input };
  }

  @UseInterceptors(TransformInterceptor)
  @MessagePattern('transformed.action')
  transformedAction(@Payload() data: any) {
    return { value: data.input };
  }
}

describe('Interceptors integration', () => {
  let app: INestMicroservice;
  let server: MemoryServer;

  beforeAll(async () => {
    server = new MemoryServer();
    const module = await Test.createTestingModule({
      controllers: [InterceptedController],
    }).compile();
    app = module.createNestMicroservice({ strategy: server });
    await app.init();
  });

  beforeEach(() => {
    interceptorLog.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should execute interceptor before and after the handler', async () => {
    await server.request('timed.action', { input: 'test' });

    expect(interceptorLog).toEqual(['before', 'handler', 'after']);
  });

  it('should allow interceptors to transform the response', async () => {
    const result = await server.request('transformed.action', { input: 'hello' });

    expect(result).toEqual({
      data: { value: 'hello' },
      transformed: true,
      timestamp: '2026-01-01',
    });
  });
});
