import type { PublicState } from '../shared/contracts';

export type BlockAction = 'block' | 'unblock';

export interface SiteBlocker {
  hasManagedBlock(): boolean;
  changeBlock(action: BlockAction, domains: string[]): Promise<void>;
}

export interface Notifier {
  notify(title: string, body: string): void;
}

export type Clock = () => number;
export type IdGenerator = () => string;
export type PublishState = (state: PublicState) => void;

export interface IpcRegistrar {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void;
}
