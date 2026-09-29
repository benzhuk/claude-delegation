// T0 interface contract. Production modules remain import-safe.
export interface HostResult {
  host: 'netcup' | 'hetzner' | 'mac';
  status: 'gathered' | 'skipped' | 'failed';
  reason: string | null;
  fetched: number;
  imported: number;
  alreadyPresent: number;
  archived: number;
  pending: number;
  managed: number;
  resurrected: number;
  unresolved: number;
  terminal: number; // superseded + origin missing first reported this run
}
export interface ImportedNote {
  host: HostResult['host'];
  originalName: string;
  importedName: string;
  sha256: string;
  stagedPath: string;
  sourceMtimeMs: number;
}
export interface Gathered { hosts: HostResult[]; imports: ImportedNote[] }
export interface Options {
  home?: string;
  stateDir?: string;
  inboxDir?: string;
  now?: () => Date;
  managedNames?: Set<string>; // internal pre-resolved managed set; never accepted by CLI
  // Dependency injection is test-only; CLI never accepts arbitrary host endpoints.
  deps?: {
    sshCommand?: string[]; // default ['ssh']; fake: [process.execPath, fakeSshPath]
    claudeCommand?: string[]; // default ['claude']
    gitCommand?: string[]; // default ['git']; test-only fixture command prefix
    chezmoiCommand?: string[]; // default ['chezmoi']; test-only source-path fixture
    nestedTimeoutMs?: number; // test-only; production remains 60 minutes
    hostTimeoutMs?: number; // test-only; production remains 60 seconds
    timers?: {
      setTimeout: (callback: () => void, milliseconds: number) => unknown;
      clearTimeout: (handle: unknown) => void;
    }; // parent watchdog scheduling only; defaults to real global timers
    hostname?: () => string;
    endpoints?: Partial<Record<HostResult['host'], string | null | 'pending'>>; // test-only: null=no alias; pending=owner answer awaited
    noteSend?: (text: string) => Promise<void>;
    dotfilesRepo?: string;
    chezmoiSourceInbox?: string;
  };
}
export declare function gatherKnowledge(options?: Options): Promise<Gathered>;
export declare function managedNames(options?: Options): Promise<{set: Set<string>; error: string | null}>;
export declare function buildNotificationInvocation(text: string, packetFile: string): {cmd: [string]; args: string[]}; // pure production argv helper, cmd[0]=process.execPath, args[0]=installed plugin note-send.mjs, includes --packet-file
export declare function reconcileKnowledge(options: Options, gathered: Gathered): Promise<HostResult[]>;
export type Tokens = {
  input: number; output: number; cacheRead: number; cacheCreation: number; total: number; // total = input + output + cacheRead + cacheCreation
} | {unavailable: string};
export interface RunReceipt {
  schemaVersion: 1;
  startedAt: string; endedAt: string;
  status: 'success' | 'skipped' | 'failed' | 'attention';
  reason: string | null;
  sessionId: string | null;
  model: string; cap: number; wallClockMs: number;
  notesIn: number; notesEligible: number; notesArchived: number; notesArrived: number;
  topicsTouched: string[];
  selected: string[]; outOfSelection: string[];
  deferredConsecutive: number;
  tokens: Tokens;
  dotfilesBefore: string | null; dotfilesSha: string | null;
  hosts: HostResult[];
  nestedExitCode: number | null;
  publication: {
    verified: boolean; reason: string | null; head: string | null;
    remoteRef: string | null; digestPath: string | null;
  };
  residue: {
    managed: {host: HostResult['host'] | 'local'; name: string}[];
    resurrected: {host: HostResult['host']; name: string}[];
    unresolved: {host: HostResult['host']; name: string; reason: string}[];
    oversize: {host: HostResult['host']; name: string}[];
    unsupportedName: {host: HostResult['host']; name: string}[];
  };
  terminal: {host: HostResult['host']; name: string; reason: 'superseded' | 'origin missing'}[];
}
export declare function runKnowledgeTriage(options?: Options): Promise<{receipt: RunReceipt; exitCode: number}>;
