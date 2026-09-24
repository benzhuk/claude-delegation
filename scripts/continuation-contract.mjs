// Shared interface for the existing native adapters and continuation runtime.
// This file is pinned by the orchestrator; implementation/tests live in continuation.mjs.
export const CONTINUATION_VERSION = 1;
export const CONTINUATION_EVENTS = Object.freeze(['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop', 'Interrupt']);
export const CONTINUATION_HOSTS = Object.freeze(['codex', 'claude']);

/**
 * @typedef {Object} ContinuationEvent
 * @property {'codex'|'claude'} host
 * @property {'SessionStart'|'UserPromptSubmit'|'PostToolUse'|'Stop'|'Interrupt'} event
 * @property {string} sessionId Native session identity, never pane identity.
 * @property {string|null} episodeKey Native-proven user episode identity.
 * @property {string|null} eventKey Native event identity or null; never raw prompt.
 * @property {'lead'|'child'|'unknown'} role
 * @property {boolean} stopHookActive
 * @property {boolean|null} cancellation Null is unknown.
 * @property {boolean} cancellationVerified True only for an evidenced host profile.
 * @property {boolean} peerWillBlock Existing peer result for this Stop.
 * @property {string|null} profile Exact adapter capability/profile identity.
 * @property {string|null=} bindRequestId Matching pending-bind request ID extracted
 *   only from actual successful CLI JSON tool output, never shell command text.
 */

/**
 * @typedef {Object} ContinuationResult
 * @property {string=} context Compact context for an already running model turn.
 * @property {string=} reason One bounded Stop correction; no additional emitter.
 * @property {string=} diagnostic Fixed code, never private content/exception text.
 * @property {function(boolean):void=} afterFlush Marks only this reserved attempt.
 */

/**
 * Core exports:
 * async handleContinuationEvent(event: ContinuationEvent, deps?: object)
 *   -> Promise<ContinuationResult|null>
 * selectContinuationSnapshot({repo, roots, authorityRef}, deps?: object)
 *   -> {status:'OK'|'UNKNOWN', revision:string|null, buckets:object, problems:array}
 * async runContinuationCli(argv:string[], deps?: object)
 *   -> Promise<{exitCode:number, stdout:string, stderr:string}>
 *
 * CLI commands: status, bind, account, stop. Bind/account/stop require host,
 * session-id and expected-epoch. Bind additionally repo, repeatable root and
 * authority-ref. Account additionally expected-revision and evidence-ref.
 * No CLI flag can enable a host capability or create a native event/epoch.
 * Successful bind stdout includes {continuationBind:{requestId,epoch}}. A matching
 * native PostToolUse can establish episodeKey when the prompt preceded transcript
 * persistence; pending activation still requires current epoch/generation CAS.
 * Injected env/home/fs/clock are for sealed fixtures, never default global writes.
 */
