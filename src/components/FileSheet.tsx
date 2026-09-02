import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme, radius, spacing } from '@/src/theme';
import { Sheet } from '@/src/components/Sheet';
import { PressableScale } from '@/src/components/PressableScale';
import { Button } from '@/src/components/ui';
import { HighlightedCode } from '@/src/components/CodeHighlight';
import { readAgentFile, statAgentPath } from '@/src/agent/fs';
import { downloadAgentFile } from '@/src/utils/download';
import { fileNameOf, dirOf, type Artifact } from '@/src/utils/artifacts';
import { haptic } from '@/src/utils/haptics';
import { toast } from '@/src/store/toast';

/* --------------------------------- helpers --------------------------------- */

function iconFor(a: Artifact): keyof typeof Ionicons.glyphMap {
  if (a.kind === 'zip') return 'archive-outline';
  const ext = a.path.split('.').pop()?.toLowerCase() ?? '';
  if (['md', 'markdown', 'txt', 'log'].includes(ext)) return 'document-text-outline';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return 'image-outline';
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return 'documents-outline';
  return 'code-slash-outline';
}

async function save(a: Artifact) {
  try {
    const res = await downloadAgentFile(a.path);
    if (res.how === 'saved') toast(`Saved to ${res.where}`, 'success');
    else if (res.how === 'shared') toast('Handed to the system save/share sheet');
    else toast('Download started in the browser', 'success');
    haptic('success');
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not save the file', 'warn');
    haptic('error');
  }
}

/* ------------------------------- reader sheet ------------------------------- */

/**
 * Claude-style artifact reader: pull the sheet down to close, read the file in
 * place with syntax colours, and a three-dot menu in the corner for
 * save / copy — tapping a .zip never opens this, it goes straight to saving.
 */
export function FileSheet({ path, onClose }: { path: string | null; onClose: () => void }) {
  const { colors } = useTheme();
  const [text, setText] = useState<string | null>(null);
  const [meta, setMeta] = useState<string>('');
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!path) return;
    let live = true;
    setText(null);
    setMenu(false);
    statAgentPath(path)
      .then((s) => live && setMeta(s.split('\n').slice(1).join(' · ').trim()))
      .catch(() => live && setMeta(''));
    readAgentFile(path, 512 * 1024)
      .then((t) => live && setText(t))
      .catch((e) => live && setText(`Could not read ${path}: ${e instanceof Error ? e.message : e}`));
    return () => {
      live = false;
    };
  }, [path]);

  const lang = path?.split('.').pop() ?? '';

  return (
    <Sheet visible={!!path} onClose={onClose} title={path ? fileNameOf(path) : ''} maxHeight="86%">
      <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(6) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2), marginBottom: spacing(3) }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11.5 }}>
              {path}
            </Text>
            {meta ? (
              <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11, marginTop: 1 }}>
                {meta}
              </Text>
            ) : null}
          </View>
          <PressableScale haptic="select" scale={0.88} onPress={() => setMenu((m) => !m)}>
            <View style={[styles.menuBtn, { backgroundColor: menu ? colors.accentSoft : colors.surface2 }]}>
              <Ionicons name="ellipsis-vertical" size={16} color={menu ? colors.accent : colors.textSub} />
            </View>
          </PressableScale>
        </View>

        {menu ? (
          <View style={[styles.menu, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <MenuItem
              icon="download-outline"
              label="Save to device"
              onPress={() => {
                setMenu(false);
                if (path) void save({ path, kind: 'text', ts: Date.now(), source: 'write_file' });
              }}
            />
            <MenuItem
              icon="copy-outline"
              label="Copy contents"
              onPress={async () => {
                setMenu(false);
                if (text) {
                  await Clipboard.setStringAsync(text);
                  toast('Copied to clipboard', 'success');
                }
              }}
            />
            <MenuItem
              icon="pricetag-outline"
              label="Copy path"
              onPress={async () => {
                setMenu(false);
                if (path) {
                  await Clipboard.setStringAsync(path);
                  toast('Path copied', 'success');
                }
              }}
            />
          </View>
        ) : null}

        <View style={[styles.body, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
          {text == null ? (
            <Text style={{ color: colors.textFaint, fontSize: 12.5, padding: spacing(4) }}>Reading…</Text>
          ) : (
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator>
              <View style={{ padding: spacing(3) }}>
                <HighlightedCode code={text} lang={lang} style={{ fontSize: 12.5, lineHeight: 19 }} />
              </View>
            </ScrollView>
          )}
        </View>

        <View style={{ marginTop: spacing(3) }}>
          <Button
            label="Save / share this file"
            icon="download-outline"
            onPress={() => path && void save({ path, kind: 'text', ts: Date.now(), source: 'write_file' })}
          />
        </View>
      </View>
    </Sheet>
  );
}

function MenuItem({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale haptic="select" scale={0.97} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), paddingVertical: spacing(2) }}>
        <Ionicons name={icon} size={15} color={colors.textSub} />
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      </View>
    </PressableScale>
  );
}

/* -------------------------------- files sheet ------------------------------- */

/** Every file this conversation produced, newest last — the artifacts panel. */
export function FilesSheet({ visible, onClose, artifacts }: { visible: boolean; onClose: () => void; artifacts: Artifact[] }) {
  const { colors } = useTheme();
  const [openPath, setOpenPath] = useState<string | null>(null);

  return (
    <>
      <Sheet visible={visible} onClose={onClose} title="Files in this chat" maxHeight="72%">
        <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(6) }}>
          {!artifacts.length ? (
            <View style={{ alignItems: 'center', gap: spacing(2), paddingVertical: spacing(8) }}>
              <Ionicons name="folder-open-outline" size={26} color={colors.textFaint} />
              <Text style={{ color: colors.textSub, fontSize: 13, fontWeight: '600' }}>No files yet</Text>
              <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: 'center', lineHeight: 17 }}>
                When the agent writes or zips something, it shows up here — and as a chip under the message that made it.
              </Text>
            </View>
          ) : (
            artifacts.map((a) => (
              <View key={a.path} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={[styles.rowIcon, { backgroundColor: a.kind === 'zip' ? colors.warningSoft : colors.accentSoft }]}>
                  <Ionicons name={iconFor(a)} size={15} color={a.kind === 'zip' ? colors.warning : colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                    {fileNameOf(a.path)}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11, marginTop: 1 }}>
                    {dirOf(a.path) || '(root)'} · {new Date(a.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                {a.kind === 'text' ? (
                  <PressableScale haptic="select" scale={0.88} onPress={() => setOpenPath(a.path)}>
                    <View style={[styles.rowBtn, { backgroundColor: colors.surface2 }]}>
                      <Ionicons name="eye-outline" size={15} color={colors.textSub} />
                    </View>
                  </PressableScale>
                ) : null}
                <PressableScale haptic="send" scale={0.88} onPress={() => void save(a)}>
                  <View style={[styles.rowBtn, { backgroundColor: colors.accent }]}>
                    <Ionicons name="download-outline" size={15} color={colors.onAccent} />
                  </View>
                </PressableScale>
              </View>
            ))
          )}
        </View>
      </Sheet>
      <FileSheet path={openPath} onClose={() => setOpenPath(null)} />
    </>
  );
}

/* ------------------------------ message chips ------------------------------- */

/** Chips under an assistant message: tap a zip to save it, text to read it. */
export function ArtifactChips({ artifacts, onOpen }: { artifacts: Artifact[]; onOpen: (path: string) => void }) {
  const { colors } = useTheme();
  if (!artifacts.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: spacing(4), marginTop: spacing(1.5) }}>
      {artifacts.map((a) => (
        <PressableScale
          key={a.path}
          haptic="select"
          scale={0.94}
          onPress={() => (a.kind === 'text' ? onOpen(a.path) : void save(a))}
        >
          <View style={[styles.chip, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
            <Ionicons name={iconFor(a)} size={13} color={a.kind === 'zip' ? colors.warning : colors.accent} />
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '700', maxWidth: 170 }}>
              {fileNameOf(a.path)}
            </Text>
            <Ionicons
              name={a.kind === 'text' ? 'chevron-forward' : 'download-outline'}
              size={12}
              color={colors.textFaint}
            />
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  menuBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menu: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    marginBottom: spacing(3),
  },
  body: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2.5),
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing(2.5),
    marginBottom: spacing(2),
  },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowBtn: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing(2.8),
    paddingVertical: spacing(1.6),
  },
});
