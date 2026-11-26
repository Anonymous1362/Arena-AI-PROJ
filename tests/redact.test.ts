import assert from 'node:assert/strict';
import test from 'node:test';
import { redactDeep, redactSecrets } from '../src/utils/redact';

test('redacts provider key prefixes', () => {
  assert.equal(redactSecrets('key sk-abcdefghijklmnop failed'), 'key sk-[redacted] failed');
  assert.equal(redactSecrets('token ghp_abcdefghijklmnopqrst'), 'token gh*_[redacted]');
  assert.equal(redactSecrets('google AIzaSyABCDEFGHIJKLMNOPQRSTUV'), 'google AIza[redacted]');
});

test('redacts bearer headers and key query params', () => {
  assert.ok(!redactSecrets('Authorization: Bearer abc.def.ghi').includes('abc.def.ghi'));
  assert.ok(!redactSecrets('https://x.dev/v1?api_key=secretvalue123').includes('secretvalue123'));
  assert.ok(!redactSecrets('https://x.dev/v1?token=abc123').includes('abc123'));
});

test('leaves ordinary prose and commit hashes alone', () => {
  const text = 'Commit 3f4a9c1d2e5b8a7f6c9d0e1f2a3b4c5d6e7f8a9b is fine.';
  assert.equal(redactSecrets(text), text);
});

test('deep redaction removes credential fields but keeps structure', () => {
  const input = {
    profiles: [{ id: 'p1', name: 'OpenAI', apiKey: 'sk-live-abcdefghijkl', baseUrl: 'https://api.openai.com/v1' }],
    nested: { token: 'ghp_abcdefghijklmnopqrst', message: 'hi' },
  };
  const out = redactDeep(input);
  assert.equal(out.profiles[0].apiKey, '[redacted]');
  assert.equal(out.nested.token, '[redacted]');
  assert.equal(out.profiles[0].name, 'OpenAI');
  assert.equal(out.nested.message, 'hi');
});
