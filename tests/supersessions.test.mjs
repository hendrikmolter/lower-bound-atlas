import assert from 'node:assert/strict';
import test from 'node:test';
import { supersessions } from '../scripts/supersessions.mjs';

test('only a supported current bound under the same hypothesis can place another in the earlier section', () => {
  const bound = id => ({ id, status: 'established', supported: true, revision: 1, assumptions: [{id: 'eth', revision: 1}] });
  const old = bound('color-eth-historical'), current = bound('color-eth-positive'), other = bound('incomparable');
  const relations = [{problem: 'lms-3color-order', hypothesis: 'eth', weaker: old.id, weakerRevision: 1, stronger: current.id, strongerRevision: 1}];
  const get = (...bounds) => [...supersessions('lms-3color-order','eth',bounds,relations).keys()];
  assert.deepEqual(get(old, current, other), [old.id]);
  assert.deepEqual(get(old, other), []);
  assert.deepEqual(get(old, {...current, status:'withdrawn'}), []);
  assert.deepEqual(get(old, {...current, supported:false}), []);
  assert.deepEqual(get(old, {...current, revision:2}), []);
  assert.deepEqual(get(old, {...current, assumptions:[{id:'sh',revision:1}]}), []);
});
