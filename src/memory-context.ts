import { BaseRpcContext } from '@nestjs/microservices';

export type MemoryContextArgs = [string];

export class MemoryContext extends BaseRpcContext<MemoryContextArgs> {
  constructor(args: MemoryContextArgs) {
    super(args);
  }

  getPattern(): string {
    return this.args[0];
  }
}
