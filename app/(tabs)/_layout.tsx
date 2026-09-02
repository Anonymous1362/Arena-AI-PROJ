import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, SECTION_TINTS } from '@/src/theme';
import { Spring, Durations, isReducedMotion } from '@/src/theme/motion';
import { useKeyboardVisible } from '@/src/utils/keyboard';
import { haptic } from '@/src/utils/haptics';
import { Message, Layers, Sliders, Terminal, Folder } from '@/src/components/Icons';

/* --------------------------------- tab config -------------------------------- */

interface TabDef {
  name: string;
  title: string;
  tint: string;
  Icon: (p: { size: number; color: string; strokeWidth?: number }) => React.ReactElement;
}

const TABS: TabDef[] = [
  { name: 'index', title: 'Chat', tint: SECTION_TINTS.agent, Icon: Message },
  { name: 'projects', title: 'Projects', tint: SECTION_TINTS.context, Icon: Folder },
  { name: 'terminal', title: 'Terminal', tint: SECTION_TINTS.shell, Icon: Terminal },
  { name: 'providers', title: 'Models', tint: SECTION_TINTS.models, Icon: Layers },
  { name: 'settings', title: 'Settings', tint: SECTION_TINTS.motion, Icon: Sliders },
];

const tintFor = (name: string) => TABS.find((t) => t.name === name)?.tint ?? SECTION_TINTS.agent;

/* --------------------------------- tab bar ---------------------------------- */

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void; emit?: (...args: never[]) => unknown };
  descriptors: Record<string, { options: Record<string, unknown> }>;
}

function CopperTabBar({ state, navigation }: TabBarProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const keyboardUp = useKeyboardVisible();
  const reduced = isReducedMotion();

  const count = state.routes.length || TABS.length;
  const pad = 8;
  const itemW = (width - pad * 2) / count;

  const index = useSharedValue(state.index);
  const hide = useSharedValue(0);
  const lastIndex = useRef(state.index);

  useEffect(() => {
    index.set(reduced ? state.index : withSpring(state.index, Spring.glide));
    if (state.index !== lastIndex.current) {
      lastIndex.current = state.index;
      haptic('navigate');
    }
  }, [index, reduced, state.index]);

  useEffect(() => {
    hide.set(withTiming(keyboardUp ? 1 : 0, { duration: reduced ? 1 : Durations.normal }));
  }, [hide, keyboardUp, reduced]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(hide.get(), [0, 1], [0, 120]) }],
    opacity: interpolate(hide.get(), [0, 0.6, 1], [1, 0.2, 0]),
  }));

  const pillStyle = useAnimatedStyle(() => ({
    width: itemW - 6,
    transform: [{ translateX: pad + index.get() * itemW + 3 }],
  }));

  const bg =
    Platform.OS === 'android'
      ? scheme === 'dark'
        ? 'rgba(25,24,23,0.97)'
        : 'rgba(240,238,230,0.98)'
      : undefined;

  const onTabPress = useCallback(
    (i: number, name: string) => {
      if (i === state.index) return;
      navigation.navigate(name);
    },
    [navigation, state.index]
  );

  return (
    <Animated.View
      style={[
        styles.barWrap,
        { paddingBottom: Math.max(insets.bottom, 6), borderColor: colors.border },
        barStyle,
      ]}
      pointerEvents={keyboardUp ? 'none' : 'auto'}
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={54} tint={scheme} style={StyleSheet.absoluteFill} pointerEvents="none" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} pointerEvents="none" />
      )}

      <View style={[styles.row, { paddingHorizontal: pad }]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { backgroundColor: colors.accentSoft }, pillStyle]}
        />
        {state.routes.map((route, i) => {
          const def = TABS.find((t) => t.name === route.name) ?? TABS[i];
          const focused = i === state.index;
          const tint = tintFor(route.name);
          return (
            <TabItem
              key={route.key}
              def={def}
              focused={focused}
              tint={tint}
              onPress={() => onTabPress(i, route.name)}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

function TabItem({
  def,
  focused,
  tint,
  onPress,
}: {
  def: TabDef;
  focused: boolean;
  tint: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const press = useSharedValue(0);
  const reduced = isReducedMotion();

  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(press.get() ? 0.9 : focused && !reduced ? 1.06 : 1, Spring.responsive) },
      { translateY: withSpring(focused && !reduced ? -1.5 : 0, Spring.snappy) },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0.55, { duration: reduced ? 1 : Durations.fast }),
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onPressIn={() => press.set(1)}
      onPressOut={() => press.set(0)}
      style={styles.tab}
    >
      <Animated.View style={[styles.tabInner, style]}>
        <View style={[styles.iconChip, focused && { backgroundColor: `${tint}1F` }]}>
          <def.Icon size={19} color={focused ? tint : colors.textFaint} strokeWidth={focused ? 2.2 : 1.7} />
        </View>
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.label,
            { color: focused ? tint : colors.textFaint, fontWeight: focused ? '800' : '600' },
            labelStyle,
          ]}
        >
          {def.title}
        </Animated.Text>
        {focused ? <View style={[styles.dot, { backgroundColor: tint }]} /> : null}
      </Animated.View>
    </Pressable>
  );
}

/* ---------------------------------- layout ---------------------------------- */

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { position: 'absolute', backgroundColor: 'transparent', elevation: 0 },
        tabBarHideOnKeyboard: false,
      }}
      tabBar={(props) => <CopperTabBar {...(props as unknown as TabBarProps)} />}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: -4 } },
      android: { elevation: 12 },
      default: { boxShadow: '0 -6px 24px rgba(0,0,0,0.10)' } as never,
    }),
  },
  row: { flexDirection: 'row', paddingTop: 7, height: 62, alignItems: 'flex-start' },
  pill: { position: 'absolute', top: 7, left: 0, height: 54, borderRadius: 18 },
  tab: { flex: 1, height: 54, alignItems: 'center', justifyContent: 'center' },
  tabInner: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  iconChip: {
    width: 30,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10.5, letterSpacing: 0.1 },
  dot: { position: 'absolute', bottom: -5, width: 4, height: 4, borderRadius: 2 },
});
