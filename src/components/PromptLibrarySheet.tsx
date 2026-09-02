/**
 * PromptLibrarySheet
 *
 * A bottom sheet that lists saved prompts. Supports:
 *   - Viewing + selecting a prompt (fires onSelect with the body text)
 *   - Creating / editing / deleting prompts inline
 *   - Used from both the chat menu (per-chat override) and the Composer
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing } from '@/src/theme';
import { usePromptsStore, type SavedPrompt } from '@/src/store/prompts';
import { Sheet } from '@/src/components/Sheet';
import { PressableScale } from '@/src/components/PressableScale';
import { Button, TextField } from '@/src/components/ui';
import { haptics } from '@/src/utils/haptics';

/* ─────────────────────────────── sub-components ─────────────────────────── */

function PromptRow({
  prompt,
  onSelect,
  onEdit,
  onDelete,
}: {
  prompt: SavedPrompt;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale haptic="selection" scale={0.985} onPress={onSelect}>
      <View
        style={[
          styles.row,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.rowBody}>
          <Text
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 14.5, fontWeight: '700' }}
          >
            {prompt.title}
          </Text>
          <Text
            numberOfLines={2}
            style={{ color: colors.textSub, fontSize: 12.5, marginTop: 3, lineHeight: 18 }}
          >
            {prompt.body}
          </Text>
        </View>
        <View style={styles.rowActions}>
          <PressableScale haptic="light" scale={0.9} onPress={onEdit}>
            <Ionicons name="pencil-outline" size={17} color={colors.textFaint} />
          </PressableScale>
          <PressableScale haptic="warning" scale={0.9} onPress={onDelete}>
            <Ionicons name="trash-outline" size={17} color={colors.danger} />
          </PressableScale>
        </View>
      </View>
    </PressableScale>
  );
}

/* ─────────────────────────────── edit form ──────────────────────────────── */

function EditForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: SavedPrompt;
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');

  return (
    <View style={{ gap: spacing(3), paddingHorizontal: spacing(4), paddingBottom: spacing(4) }}>
      <Text style={{ color: colors.textSub, fontSize: 13, fontWeight: '700', marginBottom: -spacing(1) }}>
        {initial ? 'Edit prompt' : 'New prompt'}
      </Text>
      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Concise assistant"
        autoFocus={!initial}
      />
      <TextField
        label="System prompt"
        value={body}
        onChangeText={setBody}
        placeholder="You are a concise, technical assistant…"
        multiline
        style={{ minHeight: 100 }}
      />
      <View style={{ flexDirection: 'row', gap: spacing(2) }}>
        <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={onCancel} />
        <Button
          label="Save"
          style={{ flex: 1 }}
          disabled={!body.trim()}
          onPress={() => onSave(title, body)}
        />
      </View>
    </View>
  );
}

/* ─────────────────────────────── main sheet ─────────────────────────────── */

export interface PromptLibrarySheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called when the user taps a prompt — passes its body text. */
  onSelect?: (body: string) => void;
  /** Label on the select action (default "Use prompt"). */
  selectLabel?: string;
}

export function PromptLibrarySheet({
  visible,
  onClose,
  onSelect,
  selectLabel = 'Use prompt',
}: PromptLibrarySheetProps) {
  const { colors } = useTheme();
  const { prompts, addPrompt, updatePrompt, deletePrompt } = usePromptsStore();

  const [editing, setEditing] = useState<SavedPrompt | null | 'new'>(null);

  const handleSave = (title: string, body: string) => {
    if (!body.trim()) return;
    if (editing === 'new') {
      addPrompt(title, body);
    } else if (editing) {
      updatePrompt(editing.id, { title, body });
    }
    haptics.success();
    setEditing(null);
  };

  const handleDelete = (p: SavedPrompt) => {
    Alert.alert('Delete prompt', `Delete "${p.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          haptics.warning();
          deletePrompt(p.id);
        },
      },
    ]);
  };

  const handleSelect = (p: SavedPrompt) => {
    haptics.light();
    onSelect?.(p.body);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Prompt Library" maxHeight="88%">
      {editing ? (
        <EditForm
          initial={editing === 'new' ? undefined : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: spacing(4), paddingBottom: spacing(4), gap: spacing(2) }}
            keyboardShouldPersistTaps="handled"
          >
            {prompts.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="library-outline" size={36} color={colors.textFaint} />
                <Text style={{ color: colors.textFaint, fontSize: 14, marginTop: spacing(2), textAlign: 'center' }}>
                  No saved prompts yet.{'\n'}Tap + to create your first.
                </Text>
              </View>
            ) : (
              prompts.map((p) => (
                <PromptRow
                  key={p.id}
                  prompt={p}
                  onSelect={() => handleSelect(p)}
                  onEdit={() => setEditing(p)}
                  onDelete={() => handleDelete(p)}
                />
              ))
            )}
          </ScrollView>

          <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2), gap: spacing(2) }}>
            <Button
              label="+ New prompt"
              variant="ghost"
              onPress={() => { haptics.light(); setEditing('new'); }}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing(3.5),
    gap: spacing(3),
  },
  rowBody: { flex: 1 },
  rowActions: { flexDirection: 'row', gap: spacing(3), alignItems: 'center' },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing(10),
  },
});
