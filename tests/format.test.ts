import assert from 'node:assert/strict';
import test from 'node:test';
import {
  estimateTokens,
  formatBytes,
  formatDuration,
  formatRelative,
  truncate,
} from '../src/utils/format';

test('formatBytes handles empty and sized values', () => {
  assert.equal(formatBytes(0), '—');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1024 * 1024 * 3), '3.0 MB');
});

test('formatDuration switches units at the right thresholds', () => {
  assert.equal(formatDuration(420), '420ms');
  assert.equal(formatDuration(1500), '1.5s');
  assert.equal(formatDuration(90_000), '1m 30s');
});

test('formatRelative describes recent timestamps', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelative(now - 5_000, now), 'now');
  assert.equal(formatRelative(now - 5 * 60_000, now), '5m');
  assert.equal(formatRelative(now - 3 * 86_400_000, now), '3d');
});

test('truncate collapses whitespace and respects the limit', () => {
  assert.equal(truncate('  hello   world  ', 20), 'hello world');
  assert.equal(truncate('abcdefghij', 5), 'abcd…');
  assert.ok(truncate('abcdefghij', 5).length <= 5);
});

test('estimateTokens is roughly one token per four characters', () => {
  assert.equal(estimateTokens('abcdefgh'), 2);
  assert.equal(estimateTokens(''), 0);
});
