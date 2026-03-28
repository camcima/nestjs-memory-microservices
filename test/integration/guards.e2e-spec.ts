import {
  Controller,
  INestMicroservice,
  CanActivate,
  ExecutionContext,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MemoryServer } from '../../src/memory-server';

@Injectable()
class AllowIfAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const rpcCtx = context.switchToRpc();
    const data = rpcCtx.getData();
    return data?.role === 'admin';
  }
}

@Controller()
class GuardedController {
  @UseGuards(AllowIfAdminGuard)
  @MessagePattern('admin.action')
  adminAction(@Payload() data: any) {
    return { executed: true, action: data.action };
  }

  @MessagePattern('public.action')
  publicAction(@Payload() data: any) {
    return { executed: true, action: data.action };
  }
}

describe('Guards integration', () => {
  let app: INestMicroservice;
  let server: MemoryServer;

  beforeAll(async () => {
    server = new MemoryServer();
    const module = await Test.createTestingModule({
      controllers: [GuardedController],
    }).compile();
    app = module.createNestMicroservice({ strategy: server });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should allow execution when guard passes', async () => {
    const result = await server.request('admin.action', {
      role: 'admin',
      action: 'delete-user',
    });

    expect(result).toEqual({ executed: true, action: 'delete-user' });
  });

  it('should block execution when guard rejects', async () => {
    await expect(
      server.request('admin.action', { role: 'user', action: 'delete-user' }),
    ).rejects.toMatchObject({ status: 'error', message: 'Forbidden resource' });
  });

  it('should not affect unguarded handlers', async () => {
    const result = await server.request('public.action', {
      role: 'anyone',
      action: 'view',
    });

    expect(result).toEqual({ executed: true, action: 'view' });
  });
});
