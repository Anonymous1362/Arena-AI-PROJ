import assert from 'node:assert/strict';
import test from 'node:test';
import { hostOf, isInsecureRemote, isLocalHost } from '../src/utils/net';

test('extracts hosts from URLs with and without a scheme', () => {
  assert.equal(hostOf('https://api.openai.com/v1'), 'api.openai.com');
  assert.equal(hostOf('localhost:11434/v1'), 'localhost');
  assert.equal(hostOf('http://192.168.1.20:1234/v1'), '192.168.1.20');
});

test('plain HTTP to a public host is insecure', () => {
  assert.equal(isInsecureRemote('http://api.example.com/v1'), true);
  assert.equal(isInsecureRemote('https://api.example.com/v1'), false);
});

test('plain HTTP to loopback or LAN is allowed', () => {
  assert.equal(isInsecureRemote('http://localhost:11434/v1'), false);
  assert.equal(isInsecureRemote('http://127.0.0.1:1234/v1'), false);
  assert.equal(isInsecureRemote('http://192.168.0.12:8080/v1'), false);
  assert.equal(isInsecureRemote('http://10.0.0.5:8000/v1'), false);
  assert.equal(isInsecureRemote('http://172.20.1.4:8000/v1'), false);
  assert.equal(isInsecureRemote('http://box.local:11434'), false);
});

test('isLocalHost recognises private ranges only', () => {
  assert.equal(isLocalHost('http://10.1.2.3'), true);
  assert.equal(isLocalHost('https://api.openai.com'), false);
});
