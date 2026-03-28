import { Controller, INestMicroservice, UsePipes, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { IsString, IsNumber, Min } from 'class-validator';
import { MemoryServer } from '../../src/memory-server';

class CreateOrderDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}

@Controller()
class ValidatedController {
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @MessagePattern('create.order')
  createOrder(@Payload() data: CreateOrderDto) {
    return { orderId: 'new-001', productId: data.productId, amount: data.amount };
  }
}

describe('Pipes integration', () => {
  let app: INestMicroservice;
  let server: MemoryServer;

  beforeAll(async () => {
    server = new MemoryServer();
    const module = await Test.createTestingModule({
      controllers: [ValidatedController],
    }).compile();
    app = module.createNestMicroservice({ strategy: server });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should pass validation with a valid DTO', async () => {
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

  it('should reject invalid payload (missing required field)', async () => {
    await expect(server.request('create.order', { amount: 49.99 })).rejects.toMatchObject({
      status: 'error',
    });
  });

  it('should reject invalid payload (wrong type)', async () => {
    await expect(
      server.request('create.order', { productId: 'prod-123', amount: 'not-a-number' }),
    ).rejects.toMatchObject({ status: 'error' });
  });

  it('should reject invalid payload (min constraint)', async () => {
    await expect(
      server.request('create.order', { productId: 'prod-123', amount: 0 }),
    ).rejects.toMatchObject({ status: 'error' });
  });

  it('should strip unknown properties with whitelist option', async () => {
    const result = await server.request('create.order', {
      productId: 'prod-123',
      amount: 10,
      extraField: 'should-be-stripped',
    });

    expect(result).not.toHaveProperty('extraField');
    expect(result).toEqual({
      orderId: 'new-001',
      productId: 'prod-123',
      amount: 10,
    });
  });
});
