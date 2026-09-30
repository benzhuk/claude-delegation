/**
 * Yield LF-framed rows from an async iterable of UTF-8-decoded string chunks.
 * Strip one trailing CR per row; preserve other code points and empty rows.
 * Yield a nonempty unterminated remainder; propagate source errors.
 * Callers own decoding (createReadStream with encoding: 'utf8').
 * Non-string chunks throw TypeError. Never flush remainder after source failure.
 * for-await consumption must close the stream on early consumer return.
 * Lane 40b contract stub: implementation belongs to the source builder.
 */
export async function* lfLines(stream) {
  throw new Error('Lane 40b LF reader contract not implemented');
}
