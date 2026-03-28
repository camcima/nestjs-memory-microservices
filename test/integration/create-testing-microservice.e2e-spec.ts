import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { createTestingMicroservice } from '../../src/testing/create-testing-microservice';

let received: any[] = [];

@Controller()
class HelperTestController {
  @EventPattern('helper.test')
  handle(@Payload() data: any) {
    received.push(data);
  }
}

describe('createTestingMicroservice', () => {
  beforeEach(() => {
    received = [];
  });

  it('should create a working microservice from module metadata', async () => {
    const { app, server } = await createTestingMicroservice({
      controllers: [HelperTestController],
    });

    await server.emit('helper.test', { value: 'from-helper' });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ value: 'from-helper' });

    await app.close();
  });
});
