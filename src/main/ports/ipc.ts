import type { PublicState } from '../../shared/contracts';

export type PublishState = (state: PublicState) => void;

export interface IpcRegistrar {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void;
}
