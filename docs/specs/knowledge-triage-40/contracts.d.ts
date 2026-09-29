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
  // Dependency injection is test-only; CLI never accepts arbitrary host endpoints.
  deps?: {
    sshCommand?: string[]; // default ['ssh']; fake: [process.execPath, fakeSshPath]
    claudeCommand?: string[]; // default ['claude']
    hostname?: () => string;
    endpoints?: Partial<Record<HostResult['host'], string | null>>; // test-only
    noteSend?: (text: string) => Promise<void>;
    dotfilesRepo?: string;
    chezmoiSourceInbox?: string;
  };
}
export declare function gatherKnowledge(options?: Options): Promise<Gathered>;
export declare function reconcileKnowledge(options: Options, gathered: Gathered): Promise<HostResult[]>;
export declare function runKnowledgeTriage(options?: Options): Promise<{receipt: Record<string, unknown>; exitCode: number}>;
