import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeChatsState,
  mergePromptsState,
  mergeSettingsState,
  mergeUsageState,
} from '../src/store/persisted.ts';

const settingsBase = () => ({
  profiles: [],
  activeProfileId: null,
  activeModel: null,
  modelCache: {},
  generation: { temperature: 0.7, topP: 0.95, maxTokens: 4096, systemPrompt: '' },
  agentScope: {
    enabled: true,
    storageEnabled: false,
    workspaceOnly: true,
    confirmDangerous: true,
    autoReadAloud: false,
  },
  appearance: { theme: 'system', messageTextSize: 'm', hapticsEnabled: true },
  behavior: { autoTitle: true, sendOnEnter: false, autoContinue: true },
  onboarded: false,
});

test('a damaged settings record cannot break the theme provider', () => {
  const merged = mergeSettingsState({ appearance: null }, settingsBase());
  assert.deepEqual(merged.appearance, settingsBase().appearance);
  assert.equal(merged.appearance.theme, 'system');

  const invalidTheme = mergeSettingsState(
    { appearance: { theme: 'purple', messageTextSize: 'xl', hapticsEnabled: 'yes' } },
    settingsBase()
  );
  assert.deepEqual(invalidTheme.appearance, settingsBase().appearance);
});

test('settings keep valid profiles and drop unusable or dangling ones', () => {
  const merged = mergeSettingsState(
    {
      profiles: [
        { id: 'p1', name: 'Work', baseUrl: 'https://api.example.com/v1', apiKey: 'k', suggestedModels: ['m1', 7] },
        { id: 'p2', baseUrl: 42 },
        { name: 'no id', baseUrl: 'https://x.test' },
        { id: 'p1', name: 'duplicate', baseUrl: 'https://dup.test' },
      ],
      activeProfileId: 'gone',
      activeModel: { kind: 'remote', profileId: 'gone', model: 'm' },
      modelCache: {
        p1: { models: ['m1'], fetchedAt: 123 },
        gone: { models: ['stale'], fetchedAt: 123 },
        p2: { models: 'nope', fetchedAt: 1 },
      },
      appearance: { theme: 'dark' },
      onboarded: 'yes',
    },
    settingsBase()
  );

  assert.deepEqual(
    merged.profiles.map((p) => p.id),
    ['p1']
  );
  assert.deepEqual(merged.profiles[0].suggestedModels, ['m1']);
  assert.equal(merged.activeProfileId, 'p1');
  assert.equal(merged.activeModel, null);
  assert.deepEqual(Object.keys(merged.modelCache), ['p1']);
  assert.equal(merged.appearance.theme, 'dark');
  assert.equal(merged.appearance.messageTextSize, 'm');
  assert.equal(merged.onboarded, false);
});

test('settings force the workspace boundary back on', () => {
  const merged = mergeSettingsState({ agentScope: { workspaceOnly: false } }, settingsBase());
  assert.equal(merged.agentScope.workspaceOnly, true);
  assert.equal(merged.generation.maxTokens, 4096);
});

test('chats drop malformed records instead of rendering them', () => {
  const base = { conversations: [] };
  const merged = mergeChatsState(
    {
      conversations: [
        {
          id: 'c1',
          title: 'Kept',
          createdAt: 1,
          updatedAt: 2,
          pinned: false,
          model: { kind: 'remote', profileId: 'p1', model: 'gpt' },
          messages: [
            { id: 'm1', role: 'user', content: 'hello', createdAt: 1, done: true },
            { id: 'm2', role: 'assistant', content: 42, createdAt: 2, done: true },
            { id: 'm1', role: 'user', content: 'duplicate id', createdAt: 3, done: true },
          ],
        },
        { id: 'c1', messages: [] },
        { id: 'c2', title: 'No messages array' },
        'not a conversation',
      ],
    },
    base
  );

  assert.equal(merged.conversations.length, 1);
  assert.equal(merged.conversations[0].title, 'Kept');
  assert.deepEqual(
    merged.conversations[0].messages.map((m) => m.id),
    ['m1']
  );
});

test('stored agent tool transcripts survive the rehydration guard', () => {
  const merged = mergeChatsState(
    {
      conversations: [
        {
          id: 'c1',
          messages: [
            {
              id: 'm1',
              role: 'assistant',
              content: 'done',
              createdAt: 1,
              done: true,
              transcriptTail: [
                { role: 'assistant', content: '', tool_calls: [{ id: 't1', type: 'function' }] },
                { role: 'tool', content: 'ok', tool_call_id: 't1' },
                { role: 'assistant', content: 9 },
              ],
            },
          ],
        },
      ],
    },
    { conversations: [] }
  );

  const tail = merged.conversations[0].messages[0].transcriptTail;
  assert.equal(tail?.length, 2);
  assert.deepEqual(tail?.[0].tool_calls, [{ id: 't1', type: 'function' }]);
});

test('a non-array chats record leaves the in-memory store intact', () => {
  const base = { conversations: [] };
  assert.equal(mergeChatsState({ conversations: null }, base), base);
  assert.equal(mergeChatsState('broken', base), base);
});

test('prompts keep only records with an id and body', () => {
  const merged = mergePromptsState(
    {
      prompts: [
        { id: 'pr1', title: 'T', body: 'B', createdAt: 1, updatedAt: 2 },
        { id: 'pr2', title: 'No body' },
        { id: 'pr1', title: 'Dup', body: 'B' },
      ],
    },
    { prompts: [] }
  );
  assert.deepEqual(
    merged.prompts.map((p) => p.id),
    ['pr1']
  );
});

test('usage rehydration clamps invalid counters and limits', () => {
  const base = {
    events: [],
    totals: { requests: 0, tokensIn: 0, tokensOut: 0 },
    limits: { hour: 30, day: 300 },
  };
  const merged = mergeUsageState(
    {
      events: [
        { t: 10, p: 'p1', m: 'gpt', tin: 5, tout: 7 },
        { t: 'soon', p: 'p1', m: 'gpt' },
      ],
      totals: { requests: 'lots', tokensIn: -4, tokensOut: 3 },
      limits: { hour: 0, day: 'many' },
    },
    base
  );

  assert.deepEqual(merged.events, [{ t: 10, p: 'p1', m: 'gpt', tin: 5, tout: 7 }]);
  assert.deepEqual(merged.totals, { requests: 0, tokensIn: 0, tokensOut: 3 });
  assert.deepEqual(merged.limits, { hour: 1, day: 300 });
});
