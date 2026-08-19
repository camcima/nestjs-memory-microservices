import { Controller, Injectable, Module } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { createTestingMicroservice } from '../../src/testing/create-testing-microservice';

let received: any[] = [];

@Controller()
class HelperTestController {
  @EventPattern('helper.test')
  handle(@Payload() data: any) {
    received.push(data);
  }
}

@Injectable()
class GreetingService {
  greet(name: string): string {
    return `hello ${name}`;
  }
}

@Controller()
class ModuleTestController {
  constructor(private readonly greetings: GreetingService) {}

  @MessagePattern('helper.greet')
  greet(@Payload() data: { name: string }) {
    return { message: this.greetings.greet(data.name) };
  }
}

@Module({
  controllers: [ModuleTestController],
  providers: [GreetingService],
})
class HelperTestModule {}

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

  it('should create a working microservice from a module class', async () => {
    const { app, server } = await createTestingMicroservice(HelperTestModule);

    const result = await server.request('helper.greet', { name: 'world' });

    expect(result).toEqual({ message: 'hello world' });

    await app.close();
  });
});
