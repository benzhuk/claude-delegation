// Committed API stub; replaced by the runtime territory before integration.
export async function handleContinuationEvent(event, deps = {}) { return null; }
export function selectContinuationSnapshot(options, deps = {}) {
  return { status: 'UNKNOWN', revision: null, buckets: {}, problems: ['UNIMPLEMENTED'] };
}
export async function runContinuationCli(argv, deps = {}) {
  return { exitCode: 1, stdout: '', stderr: 'continuation: UNIMPLEMENTED\n' };
}
