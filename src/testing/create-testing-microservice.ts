import { INestMicroservice, ModuleMetadata, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MemoryServer } from '../memory-server';

export interface TestingMicroserviceResult {
  app: INestMicroservice;
  server: MemoryServer;
}

export async function createTestingMicroservice(
  moduleOrMetadata: Type<any> | ModuleMetadata,
): Promise<TestingMicroserviceResult> {
  const server = new MemoryServer();
  const metadata: ModuleMetadata =
    typeof moduleOrMetadata === 'function' ? { imports: [moduleOrMetadata] } : moduleOrMetadata;
  const moduleFixture = await Test.createTestingModule(metadata).compile();
  const app = moduleFixture.createNestMicroservice({ strategy: server });
  await app.init();
  return { app, server };
}
