import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, radius, spacing } from '@/src/theme';
import { Sheet } from '@/src/components/Sheet';
import { Button } from '@/src/components/ui';
import { Terminal as TerminalIcon, Trash } from '@/src/components/Icons';
import { useConfirmStore } from '@/src/agent/confirm';
import { haptics } from '@/src/utils/haptics';

/** Sheet shown when the agent asks permission for a destructive action. */
export function ConfirmSheet() {
  const { colors } = useTheme();
  const pending = useConfirmStore((s) => s.pending);
  const answer = useConfirmStore((s) => s.answer);

  const isDelete = pending?.toolName === 'delete_path';
  const Icon = isDelete ? Trash : TerminalIcon;

  return (
    <Sheet
      visible={!!pending}
      onClose={() => answer(false)}
      title="Permission needed"
      plain={false}
    >
      <View style={{ paddingHorizontal: spacing(4), paddingBottom: spacing(2) }}>
        <View
          style={{
            flexDirection: 'row',
            gap: spacing(3),
            alignItems: 'flex-start',
            marginBottom: spacing(4),
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 13,
              backgroundColor: isDelete ? colors.dangerSoft : colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={19} color={isDelete ? colors.danger : colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15.5, fontWeight: '700', lineHeight: 21 }}>
              {pending?.summary ?? ''}
            </Text>
            {pending?.argsPreview && pending.argsPreview !== '{}' ? (
              <Text
                numberOfLines={4}
                style={{
                  color: colors.textFaint,
                  fontSize: 12,
                  marginTop: spacing(1.5),
                  fontFamily: undefined,
                }}
              >
                {pending.argsPreview}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={{ gap: spacing(2) }}>
          <Button
            label={isDelete ? 'Allow deletion' : 'Allow command'}
            variant="danger"
            icon="checkmark"
            onPress={() => {
              haptics.medium();
              answer(true);
            }}
          />
          <Button label="Deny" variant="secondary" onPress={() => { haptics.warning(); answer(false); }} />
        </View>
        <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: spacing(3), lineHeight: 17 }}>
          The agent stays jailed to its storage root.{'\n'}You can turn confirmations off in Agent & storage.
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg },
});
