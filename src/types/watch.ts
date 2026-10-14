export enum DiffMode {
  DEFAULT = 'default', // HEAD^ vs HEAD
  WORKING = 'working', // staged vs working
  STAGED = 'staged', // HEAD vs staged
  DOT = 'dot', // HEAD vs working (all changes)
  SPECIFIC = 'specific', // commit vs commit (no watching)
  LADDER = 'ladder', // review ladder: rungs of base..branch, follows the branch ref
}

type WatchChangeType = 'file' | 'commit' | 'staging';

interface ConnectedWatchEvent {
  type: 'connected';
  diffMode: DiffMode;
  changeType: WatchChangeType;
  timestamp: string;
  message?: string;
}

interface ReloadWatchEvent {
  type: 'reload';
  diffMode: DiffMode;
  changeType: WatchChangeType;
  timestamp: string;
  message?: string;
}

interface ErrorWatchEvent {
  type: 'error';
  diffMode: DiffMode;
  changeType: WatchChangeType;
  timestamp: string;
  message?: string;
}

interface CommentsChangedWatchEvent {
  type: 'commentsChanged';
  version: number;
  timestamp: string;
}

// Session state outside the comment list changed: pending count, approvals, finish.
interface ReviewChangedWatchEvent {
  type: 'reviewChanged';
  finished?: boolean;
  timestamp: string;
}

export type WatchEvent =
  | ConnectedWatchEvent
  | ReloadWatchEvent
  | ErrorWatchEvent
  | CommentsChangedWatchEvent
  | ReviewChangedWatchEvent;

export interface ClientWatchState {
  isWatchEnabled: boolean;
  diffMode: DiffMode;
  shouldReload: boolean;
  isReloading: boolean;
  lastChangeTime: Date | null;
  lastChangeType: WatchChangeType | null;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
}
