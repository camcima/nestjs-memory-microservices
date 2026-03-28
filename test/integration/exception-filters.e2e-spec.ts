import {
  Controller,
  INestMicroservice,
  Catch,
  UseFilters,
  ArgumentsHost,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MessagePattern,
  Payload,
  RpcException,
  BaseRpcExceptionFilter,
} from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';
import { MemoryServer } from '../../src/memory-server';

@Catch(RpcException)
class CustomRpcExceptionFilter extends BaseRpcExceptionFilter {
  catch(exception: RpcException, _host: ArgumentsHost): Observable<any> {
    const error = exception.getError();
    return throwError(() => ({
      customError: true,
      message: typeof error === 'string' ? error : (error as any).message,
      code: 'CUSTOM_ERROR',
    }));
  }
}

@Controller()
class ErrorController {
  @MessagePattern('will.throw.rpc')
  throwRpcException(@Payload() data: any): never {
    throw new RpcException(`Order ${data.id} not found`);
  }

  @UseFilters(new CustomRpcExceptionFilter())
  @MessagePattern('will.throw.filtered')
  throwFilteredException(@Payload() data: any): never {
    throw new RpcException(`Cannot process order ${data.id}`);
  }

  @MessagePattern('will.throw.generic')
  throwGenericError(): never {
    throw new Error('Unexpected internal error');
  }
}

describe('Exception Filters integration', () => {
  let app: INestMicroservice;
  let server: MemoryServer;

  beforeAll(async () => {
    server = new MemoryServer();
    const module = await Test.createTestingModule({
      controllers: [ErrorController],
    }).compile();
    app = module.createNestMicroservice({ strategy: server });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should propagate RpcException as a rejected object', async () => {
    await expect(
      server.request('will.throw.rpc', { id: 'order-42' }),
    ).rejects.toMatchObject({
      status: 'error',
      message: 'Order order-42 not found',
    });
  });

  it('should use custom exception filter to transform errors', async () => {
    await expect(
      server.request('will.throw.filtered', { id: 'order-99' }),
    ).rejects.toEqual({
      customError: true,
      message: 'Cannot process order order-99',
      code: 'CUSTOM_ERROR',
    });
  });

  it('should propagate generic errors', async () => {
    await expect(
      server.request('will.throw.generic', {}),
    ).rejects.toBeDefined();
  });
});
