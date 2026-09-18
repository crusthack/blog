import test from 'node:test';
import assert from 'node:assert/strict';

import { toggleMineFlag } from '../../apps/frontend/src/lib/minesweeper.ts';

const hiddenCell = () => ({ isMine: false, isRevealed: false, isFlagged: false, adjacent: 0 });

test('rapid flag actions are applied in order to the latest board', () => {
  const initial = [[hiddenCell(), hiddenCell()]];
  const flagged = toggleMineFlag(initial, 0, 0, 1);
  const unflagged = toggleMineFlag(flagged, 0, 0, 1);

  assert.equal(flagged[0][0].isFlagged, true);
  assert.equal(unflagged[0][0].isFlagged, false);
  assert.equal(initial[0][0].isFlagged, false);
});

test('flag limit and revealed cells reject changes without replacing the board', () => {
  const full = [[{ ...hiddenCell(), isFlagged: true }, hiddenCell()]];
  const revealed = [[{ ...hiddenCell(), isRevealed: true }]];

  assert.strictEqual(toggleMineFlag(full, 0, 1, 1), full);
  assert.strictEqual(toggleMineFlag(revealed, 0, 0, 1), revealed);
  assert.strictEqual(toggleMineFlag(full, 4, 4, 1), full);
});
