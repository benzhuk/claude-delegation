/**
 * Yield LF-framed rows from an async iterable of UTF-8-decoded string chunks.
 * Strip one trailing CR per row; preserve other code points (U+2028/U+2029 included)
 * and empty rows. Yield a nonempty unterminated remainder; propagate source errors
 * without yielding the pending remainder. Callers own decoding and blank-row policy
 * (createReadStream with encoding: 'utf8'). Non-string chunks are rejected rather than
 * decoded, since decoding a chunk alone would corrupt a multibyte sequence split across chunks.
 */
export async function* lfLines(stream) {
  const stripCr = (row) => (row.endsWith('\r') ? row.slice(0, -1) : row);
  let rest = '';
  // for-await (not manual iteration) so an early consumer return destroys a Readable.
  for await (const chunk of stream) {
    if (typeof chunk !== 'string') throw new TypeError('lfLines expects UTF-8-decoded string chunks');
    rest += chunk;
    let start = 0;
    let end;
    while ((end = rest.indexOf('\n', start)) !== -1) {
      yield stripCr(rest.slice(start, end));
      start = end + 1;
    }
    rest = rest.slice(start);
  }
  if (rest.length > 0) yield stripCr(rest);
}
