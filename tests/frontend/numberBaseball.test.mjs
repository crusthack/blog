import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendBaseballDigit,
  baseballKeyCommand,
  evaluateBaseballGuess,
} from '../../apps/frontend/src/lib/numberBaseball.ts';

test('number baseball scores strikes and balls by position', () => {
  assert.deepEqual(evaluateBaseballGuess('1234', '1234'), { strikes: 4, balls: 0 });
  assert.deepEqual(evaluateBaseballGuess('4321', '1234'), { strikes: 0, balls: 4 });
  assert.deepEqual(evaluateBaseballGuess('1567', '1234'), { strikes: 1, balls: 0 });
});

test('number baseball input accepts four unique digits only', () => {
  assert.equal(appendBaseballDigit('', '0'), '0');
  assert.equal(appendBaseballDigit('01', '1'), '01');
  assert.equal(appendBaseballDigit('0123', '4'), '0123');
  assert.equal(appendBaseballDigit('01', 'x'), '01');
  assert.equal(appendBaseballDigit('01', '2'), '012');
});

test('number baseball keyboard commands support digits, erase, and submit safely', () => {
  assert.deepEqual(baseballKeyCommand({ key: '7' }), { type: 'digit', digit: '7' });
  assert.deepEqual(baseballKeyCommand({ key: 'Backspace' }), { type: 'remove-last' });
  assert.deepEqual(baseballKeyCommand({ key: 'Delete' }), { type: 'remove-last' });
  assert.deepEqual(baseballKeyCommand({ key: 'Enter' }), { type: 'submit' });
  assert.deepEqual(baseballKeyCommand({ key: 'NumpadEnter' }), { type: 'submit' });
  assert.equal(baseballKeyCommand({ key: '7', ctrlKey: true }), null);
  assert.equal(baseballKeyCommand({ key: '7', metaKey: true }), null);
  assert.equal(baseballKeyCommand({ key: '7', altKey: true }), null);
  assert.equal(baseballKeyCommand({ key: '7', isComposing: true }), null);
  assert.equal(baseballKeyCommand({ key: 'ArrowDown' }), null);
});
