// Work record contract stub. Pinned in next-build/spec.md, C1 and C2. Territory T1 fills the
// bodies; every other territory imports these names and tests against hand-written fixtures.
// Header lines in a record match /^[ \t*+-]{0,20}<Label>:\**[ \t]*(.+)$/mi, the dispatch
// guard's bounded shape: a [ \t]-only class with an explicit {0,20} bound, never \s.

export const STATUSES = ["runnable", "owned", "delivered", "reviewed", "accepted", "blocked"];

export const REQUIRED_FIELDS = ["work", "scope", "owner", "status", "authority", "artifact", "evidence", "next", "opened"];

export const OPTIONAL_FIELDS = ["children", "builder", "rounds", "class"];

export const FINDING_CODES = [
  "missing-field",
  "bad-status",
  "bad-work-id",
  "accepted-without-artifact",
  "accepted-without-evidence",
  "evidence-missing",
  "evidence-no-verdict",
  "stale-result-candidate",
  "scope-drift",
  "workaround-overdue",
];

// -> { fields, workarounds: [{ cause, blockedBy, removeWhen }], log: [{ at, status, owner, note }], errors: [] }
export function parseRecord(text) {
  throw new Error("not implemented: parseRecord (territory T1)");
}

// opts: { fsImpl, now, gitDir } -> [{ code, message }]
export function validateRecord(record, opts = {}) {
  throw new Error("not implemented: validateRecord (territory T1)");
}

// opts: { fsImpl } -> [{ path, record }], reads <dir>/*.record.md only, never recurses
export function listRecords(dir, opts = {}) {
  throw new Error("not implemented: listRecords (territory T1)");
}

export function formatLogLine(at, status, owner, note) {
  throw new Error("not implemented: formatLogLine (territory T1)");
}
