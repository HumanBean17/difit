import { describe, expect, it } from 'vitest';

import { parseRungMessage } from './rungMessage';

describe('parseRungMessage', () => {
  it('splits Verify claims on semicolons and bullets', () => {
    const parsed = parseRungMessage(
      'Verify: three attempts in total; the wait doubles; retry.test.js pins the waits.\n- New dependency: ms',
    );
    expect(parsed.verify).toEqual([
      'three attempts in total',
      'the wait doubles',
      'retry.test.js pins the waits.',
      'New dependency: ms',
    ]);
  });

  it('reads Proof and Oversize, keeping other lines as notes', () => {
    const parsed = parseRungMessage(
      'Prep rung.\n\nProof: `npm test` → 12 pass\n\nOversize: one generated schema',
    );
    expect(parsed).toEqual({
      verify: [],
      proof: '`npm test` → 12 pass',
      oversize: 'one generated schema',
      notes: ['Prep rung.'],
    });
  });

  it('handles an empty body', () => {
    expect(parseRungMessage('')).toEqual({ verify: [], notes: [] });
  });
});
