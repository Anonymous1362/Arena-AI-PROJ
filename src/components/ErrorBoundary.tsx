import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level render barrier. Without one, a single thrown render (bad model
 * payload, malformed markdown, a tablet layout edge case) unmounts the whole
 * tree and leaves a blank screen with no way back.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the stack in the native log for dev builds; never send it anywhere.
    console.error('[copper] render error', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.badge, { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name="warning-outline" size={28} color={colors.danger} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Copper hit a snag</Text>
        <Text style={[styles.body, { color: colors.textSub }]}>
          Something in this screen failed to render. Your chats and settings are still on this device — try again,
          and the app will re-open where you left off.
        </Text>
        <View style={[styles.code, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <Text selectable style={{ color: colors.textFaint, fontSize: 12, lineHeight: 18 }}>
            {error.message || 'Unknown error'}
          </Text>
        </View>
        <PressableScale
          haptic="press"
          onPress={onRetry}
          style={[styles.button, { backgroundColor: colors.accent }]}
        >
          <Ionicons name="refresh" size={17} color={colors.onAccent} />
          <Text style={{ color: colors.onAccent, fontSize: 15, fontWeight: '700' }}>Try again</Text>
        </PressableScale>
        <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: spacing(3), textAlign: 'center' }}>
          If this keeps happening, export your chats from Settings → Data &amp; privacy, then restart the app.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(6) },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing(4),
  },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  body: { fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginTop: spacing(2) },
  code: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing(3),
    marginTop: spacing(4),
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.full,
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(3),
    marginTop: spacing(4),
  },
});
