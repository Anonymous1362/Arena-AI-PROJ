import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing, SECTION_TINTS } from '@/src/theme';
import { SettingsScaffold, TintSection } from '@/src/components/SettingsScaffold';
import { PressableScale } from '@/src/components/PressableScale';
import { Button, Card, Segmented, Stepper, SwitchRow } from '@/src/components/ui';
import { ModelSheet } from '@/src/components/ModelSheet';
import { useSettingsStore, type ThinkingLevel } from '@/src/store/settings';
import {
  PROVIDER_PRESETS,
  THINKING_LEVELS,
  contextWindowFor,
  formatContext,
  modelMeta,
  prettyModelName,
  supportedThinkingLevels,
} from '@/src/ai/catalog';
import { haptic } from '@/src/utils/haptics';

const TINT = SECTION_TINTS.models;

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ backgroundColor: `${color}1F`, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>{text}</Text>
    </View>
  );
}

export default function ModelsSettingsScreen() {
  const { colors } = useTheme();
  const activeModel = useSettingsStore((s) => s.activeModel);
  const profiles = useSettingsStore((s) => s.profiles);
  const setActiveModel = useSettingsStore((s) => s.setActiveModel);
  const generation = useSettingsStore((s) => s.generation);
  const patchGeneration = useSettingsStore((s) => s.patchGeneration);
  const context = useSettingsStore((s) => s.context);
  const patchContext = useSettingsStore((s) => s.patchContext);
  const [picker, setPicker] = useState(false);

  const profile = profiles.find((p) => p.id === activeModel?.profileId);
  const modelName = activeModel?.model ?? '';
  const meta = modelMeta(modelName);
  const levels = supportedThinkingLevels(modelName);
  const window = context.windowOverride > 0 ? context.windowOverride : contextWindowFor(modelName);

  const thinkingNote =
    meta.thinking === 'gemini-level'
      ? `Gemini 3.x thinking levels. Google’s own app calls the top setting “Extended thinking” — that is ${meta.family}’s \`high\` level, sent as \`thinking_config.thinking_level\`.`
      : meta.thinking === 'gemini-budget'
        ? `Gemini 2.5 uses a token budget: minimal 128 · low 1,024 · medium 8,192 · high 24,576. Sent as \`thinking_config.thinking_budget\`.`
        : meta.thinking === 'openai-effort'
          ? `${meta.family} exposes \`reasoning_effort\` — the same four levels, mapped 1:1.`
          : 'This model has no reasoning control. The level below is ignored for it (it still applies to models that do support thinking).';

  return (
    <SettingsScaffold
      title="Models & thinking"
      subtitle="Reasoning + context"
      tint={TINT}
      icon="cube-outline"
      intro="One control for every provider’s reasoning knob, plus the context-window meter and the auto-compact safety net."
    >
      {/* ---------------------------- active model ---------------------------- */}
      <TintSection title="Active model" tint={TINT} icon="star-outline">
        <PressableScale haptic="select" scale={0.99} onPress={() => setPicker(true)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(3) }}>
            <View style={[styles.modelIcon, { backgroundColor: `${TINT}1F` }]}>
              <Ionicons name="cube-outline" size={20} color={TINT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
                {modelName ? prettyModelName(modelName) : 'No model selected'}
              </Text>
              <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 2 }}>
                {profile?.name ?? 'Add a provider'} {modelName ? `· ${modelName}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
          </View>
        </PressableScale>

        {modelName ? (
          <View style={styles.metaRow}>
            <Badge text={`${formatContext(meta.contextWindow)} ctx`} color={colors.info} />
            <Badge text={`${formatContext(meta.maxOutput)} out`} color={colors.chart[2]} />
            <Badge text={meta.thinking === 'none' ? 'no thinking' : meta.thinking.replace('-', ' ')} color={colors.chart[4]} />
            {meta.supportsVision ? <Badge text="vision" color={colors.chart[3]} /> : null}
          </View>
        ) : null}

        {!modelName ? (
          <Button label="Connect a provider" icon="key-outline" onPress={() => setPicker(true)} />
        ) : null}
      </TintSection>

      {/* ------------------------------- thinking ------------------------------ */}
      <TintSection title="Thinking level" tint={SECTION_TINTS.motion} icon="sparkles-outline">
        <Segmented<ThinkingLevel>
          options={THINKING_LEVELS.filter((l) => (levels as string[]).includes(l.value)).map((l) => ({
            value: l.value,
            label: l.label,
          }))}
          value={generation.thinking}
          onChange={(v) => {
            haptic('select');
            patchGeneration({ thinking: v });
          }}
        />
        <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: spacing(2.5), lineHeight: 17 }}>
          {thinkingNote}
        </Text>

        {levels.length <= 1 ? (
          <View style={[styles.warn, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
            <Text style={{ color: colors.warning, fontSize: 11.5, flex: 1, lineHeight: 16 }}>
              {modelName
                ? 'This model does not take a reasoning level. Switch to Gemini 3.x, GPT-5.x or an o-series model to use it.'
                : 'Pick a model to see which levels it supports.'}
            </Text>
          </View>
        ) : null}

        <SwitchRow
          label="Show thinking panel"
          hint="Stream thought summaries into a collapsible panel above each reply (Gemini include_thoughts / reasoning_content)."
          value={generation.showThinking}
          onChange={(v) => patchGeneration({ showThinking: v })}
        />
      </TintSection>

      {/* -------------------------------- context ------------------------------ */}
      <TintSection title="Context window" tint={SECTION_TINTS.context} icon="speedometer-outline">
        <View style={styles.windowRow}>
          <Text style={{ color: colors.textFaint, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>
            Effective window
          </Text>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {formatContext(window)}
          </Text>
        </View>

        <SwitchRow
          label="Live meter in the chat header"
          hint="Animated bar showing tokens used vs the window. Uses provider-reported prompt tokens when available."
          value={context.showMeter}
          onChange={(v) => patchContext({ showMeter: v })}
        />

        <Stepper
          label="Window override"
          hint="0 = detect from the model. Set a hard ceiling for custom or self-hosted endpoints."
          value={context.windowOverride / 1000}
          step={16}
          min={0}
          max={2048}
          format={(v) => (v === 0 ? 'auto' : `${Math.round(v)}K`)}
          onChange={(v) => patchContext({ windowOverride: Math.round(v * 1000) })}
        />
      </TintSection>

      <TintSection title="Auto-compact" tint={SECTION_TINTS.usage} icon="archive-outline">
        <SwitchRow
          label="Compress before the ceiling"
          hint="At the threshold below, the conversation is summarised into a Project Summary State and only the most recent turns are kept verbatim. Nothing is deleted — older messages stay visible behind a divider and in exports."
          value={context.autoCompact}
          onChange={(v) => patchContext({ autoCompact: v })}
        />
        <Stepper
          label="Trigger at"
          hint="Percentage of the window."
          value={context.compactAtPct}
          step={5}
          min={50}
          max={95}
          format={(v) => `${Math.round(v)}%`}
          onChange={(v) => patchContext({ compactAtPct: Math.round(v) })}
        />
        <View style={[styles.note, { backgroundColor: colors.surface2 }]}>
          <Text style={{ color: colors.textSub, fontSize: 12, lineHeight: 18 }}>
            On a 1M-token window at 85% that is ~850K tokens of history compressed into roughly 600 tokens of
            structured state — goal, stack, done, current state, open issues, next steps, constraints — with the last
            six turns kept word-for-word. You can also run it any time from the chat menu or the meter sheet.
          </Text>
        </View>
      </TintSection>

      {/* ------------------------------- catalog ------------------------------- */}
      <TintSection title="Current model catalog" tint={SECTION_TINTS.providers} icon="library-outline" note="Sept 2026">
        {PROVIDER_PRESETS.filter((p) => (p.cards?.length ?? 0) > 0).map((p) => (
          <View key={p.id} style={{ marginBottom: spacing(4) }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '800', marginBottom: spacing(1.5) }}>{p.name}</Text>
            {p.cards!.map((c) => {
              const m = modelMeta(c.id);
              const active = modelName === c.id;
              return (
                <PressableScale
                  key={c.id}
                  haptic="select"
                  scale={0.99}
                  onPress={() => {
                    const prof = profiles.find((x) => x.baseUrl === p.baseUrl);
                    if (prof) {
                      setActiveModel({ kind: 'remote', profileId: prof.id, model: c.id });
                      haptic('success');
                    } else {
                      setPicker(true);
                    }
                  }}
                >
                  <View style={[styles.catalogRow, active && { backgroundColor: colors.accentSoft }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: active ? colors.accent : colors.text, fontSize: 13, fontWeight: '700' }}>{c.id}</Text>
                      {c.note ? <Text style={{ color: colors.textFaint, fontSize: 11.5, marginTop: 1 }}>{c.note}</Text> : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
                      <Badge text={formatContext(m.contextWindow)} color={colors.info} />
                      {c.badge ? <Badge text={c.badge.toUpperCase()} color={colors.chart[3]} /> : null}
                    </View>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        ))}
        <Text style={{ color: colors.textFaint, fontSize: 11.5, lineHeight: 17 }}>
          These are quick picks. The model picker always merges the live list from your provider’s /models endpoint, so
          anything released after this build shows up automatically once the list is fetched.
        </Text>
      </TintSection>

      <Card style={{ marginTop: spacing(5) }}>
        <Button label="Open model picker" icon="options-outline" onPress={() => setPicker(true)} />
      </Card>

      <ModelSheet
        visible={picker}
        onClose={() => setPicker(false)}
        current={activeModel}
        onPicked={(m) => setActiveModel(m)}
      />
    </SettingsScaffold>
  );
}

const styles = StyleSheet.create({
  modelIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing(3) },
  windowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(2) },
  warn: { flexDirection: 'row', gap: 8, borderRadius: radius.md, padding: spacing(3), marginTop: spacing(3) },
  note: { borderRadius: radius.md, padding: spacing(3), marginTop: spacing(2) },
  catalogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(2.4),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.14)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing(1),
  },
});
