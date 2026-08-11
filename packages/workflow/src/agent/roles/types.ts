export interface AgentRole<Input, Output> {
  readonly id: string;
  readonly skillIds: ReadonlyArray<string>;
  execute(input: Input, signal?: AbortSignal): Promise<Output> | Output;
}
