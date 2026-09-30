/** Lane62 additive contracts. Existing report fields remain unchanged. */
export type Coverage = 'complete' | 'PARTIAL' | 'unavailable';
export type Role = 'builder' | 'reviewer' | 'integrator' | 'scout' | 'spec-reviewer';
export interface RoleManifest {
  version: 1;
  work: string;
  sessions: Array<{host: 'claude'; sessionId: string; role: Role;
    evidence: string; transcript: string}>;
}
export interface RoleResult {
  host: 'claude'; sessionId: string; role: Role; evidence: string;
  status: Coverage; reasons: string[];
}
export interface MeasurementScope {
  roles: 'native-only' | 'native-plus-declared';
  from: string | null; to: string | null;
  omitted: Array<{host: string; sessionId: string; reason: string}>;
  limitations: string[];
}
export interface ActivityInterval {
  from: string; to: string; durationMs: number;
  kind: 'in-turn-silence' | 'tool-running' | 'between-turns';
  rightCensored: boolean; turnIds: string[]; callIds: string[];
  sourceRows: number[];
}
export interface CodexActivity {
  coverage: Coverage; reasons: string[]; thresholdMs: 7200000;
  causalAttribution: 'UNSUPPORTED'; intervals: ActivityInterval[];
  observedSilentGaps: number | null; toolRunningGaps: number | null;
}
export interface CensusAdditions {
  tokenDefinition: {id: 'processed-v1'; formula: string};
  measurementScope: MeasurementScope; roleSessions: RoleResult[];
  activity?: CodexActivity;
}
export interface ReworkAttribution {
  coverage: Coverage; reasons: string[]; scope: 'declared-links-only';
  asOf: string; windowEnd: string | null; mature: boolean;
  episodes: Array<{work: string; parent: string; admittedAt: string;
    source: 'follow-up-of'}>;
  outsideWindow: Array<{work: string; reason: string}>;
  episodeCount: number | null;
}
/** Additive four-read JSON property. Legacy number values remain present. */
export interface FourReadAdditions { reworkAttribution: ReworkAttribution }
/** exports from scripts/census-measures.mjs; invalid vectors throw. */
export declare function processedTokenTotal(host: 'claude' | 'codex', usage: {
  input_tokens: number; output_tokens: number;
  cache_creation_input_tokens?: number; cache_read_input_tokens?: number;
  cached_input_tokens?: number; reasoning_output_tokens?: number;
}): number;
/** Unknown/unclassified model is null; known non-top model is false. */
export declare function isTopTierModel(model: string | null,
  configuredModels?: string[]): boolean | null;
