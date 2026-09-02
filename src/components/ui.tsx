import React from 'react';
import { PressableProps, StyleSheet, Switch, Text, TextInput, TextInputProps, View, ViewStyle, StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/src/theme';
import { radius, spacing, typeScale } from '@/src/theme';
import { PressableScale } from '@/src/components/PressableScale';
import { Durations, Ease, Spring } from '@/src/theme/motion';
import { haptics } from '@/src/utils/haptics';
import { Ionicons } from '@expo/vector-icons';

/* ---------------------------------- Card ---------------------------------- */

export function Card({
  children,
  style,
  padded = true,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        padded && { padding: spacing(4) },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ------------------------------ SectionHeader ------------------------------ */

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing(1), marginTop: spacing(6), marginBottom: spacing(2) }}>
      <Text style={[typeScale.micro, { color: colors.textFaint, letterSpacing: 1.2, textTransform: 'uppercase' }]}>
        {title}
      </Text>
      {action}
    </View>
  );
}

/* ---------------------------------- Chip ----------------------------------- */

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale haptic="selection" onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: spacing(3.5),
          paddingVertical: spacing(2),
          borderRadius: radius.full,
          backgroundColor: selected ? colors.accentSoft : colors.surface2,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: selected ? colors.accent : colors.border,
        }}
      >
        {icon ? <Ionicons name={icon} size={14} color={selected ? colors.accent : colors.textSub} /> : null}
        <Text style={{ color: selected ? colors.accent : colors.textSub, fontSize: 13.5, fontWeight: '600' }}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

/* -------------------------------- Segmented --------------------------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));

  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  const shown = useSharedValue(0);
  /** Measured layout of each segment, keyed by index. */
  const measured = React.useRef<{ x: number; width: number }[]>([]);

  const moveTo = React.useCallback(
    (index: number, animate: boolean) => {
      const l = measured.current[index];
      if (!l) return;
      if (animate) {
        pillX.value = withSpring(l.x, Spring.glide);
        pillW.value = withSpring(l.width, Spring.glide);
      } else {
        pillX.value = l.x;
        pillW.value = l.width;
      }
      shown.value = withTiming(1, { duration: Durations.fast, easing: Ease.out });
    },
    [pillX, pillW, shown]
  );

  const measure = React.useCallback(
    (index: number, layout: { x: number; width: number }) => {
      measured.current[index] = { x: layout.x, width: layout.width };
      // First paint of the active segment lands without a flight across the row.
      if (index === activeIndex) moveTo(index, shown.value > 0);
    },
    [activeIndex, moveTo, shown]
  );

  React.useEffect(() => {
    moveTo(activeIndex, true);
  }, [activeIndex, moveTo]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillW.value,
    opacity: shown.value,
  }));

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface2,
        borderRadius: radius.md,
        padding: 3,
        gap: 3,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          pillStyle,
          {
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: 0,
            backgroundColor: colors.surface,
            borderRadius: radius.sm + 2,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          },
        ]}
      />
      {options.map((o, i) => (
        <SegmentItem
          key={o.value}
          label={o.label}
          active={i === activeIndex}
          onLayout={(x, width) => measure(i, { x, width })}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

/**
 * One segment. Split out so the animated/text styles stay inside a component
 * that mounts once per option — hooks never run inside a `.map()` body.
 */
function SegmentItem({
  label,
  active,
  onPress,
  onLayout,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLayout: (x: number, width: number) => void;
}) {
  const { colors } = useTheme();
  const mix = useSharedValue(active ? 1 : 0);
  React.useEffect(() => {
    mix.value = withTiming(active ? 1 : 0, { duration: Durations.fast, easing: Ease.out });
  }, [active, mix]);
  const labelStyle = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * mix.value }));

  return (
    <PressableScale
      haptic="select"
      scale={0.98}
      flat
      onPress={onPress}
      style={{ flex: 1 }}
      onLayout={(e) => onLayout(e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
    >
      <View style={{ paddingVertical: spacing(1.8), borderRadius: radius.sm + 2, alignItems: 'center' }}>
        <Animated.Text style={[{ color: active ? colors.text : colors.textSub, fontSize: 13.5, fontWeight: active ? '700' : '500' }, labelStyle]}>
          {label}
        </Animated.Text>
      </View>
    </PressableScale>
  );
}

/* --------------------------------- Stepper ---------------------------------- */

export function Stepper({
  label,
  value,
  step,
  min,
  max,
  format,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const { colors } = useTheme();
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 1000) / 1000));
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing(3),
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        {hint ? (
          <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 2 }}>{hint}</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <PressableScale
          haptic="light"
          scale={0.88}
          disabled={value <= min}
          onPress={() => onChange(clamp(value - step))}
          style={{ opacity: value <= min ? 0.35 : 1 }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="remove" size={20} color={colors.text} />
          </View>
        </PressableScale>
        <View style={{ minWidth: 74, alignItems: 'center' }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {format ? format(value) : String(value)}
          </Text>
        </View>
        <PressableScale
          haptic="light"
          scale={0.88}
          disabled={value >= max}
          onPress={() => onChange(clamp(value + step))}
          style={{ opacity: value >= max ? 0.35 : 1 }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={20} color={colors.accent} />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

/* -------------------------------- SwitchRow --------------------------------- */

export function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing(2.5) }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        {hint ? <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          haptics.selection();
          onChange(v);
        }}
        trackColor={{ false: colors.surface3, true: colors.accent }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={colors.surface3}
      />
    </View>
  );
}

/* --------------------------------- TextField --------------------------------- */

export function TextField({
  label,
  hint,
  secure,
  trailing,
  ...props
}: TextInputProps & { label?: string; hint?: string; secure?: boolean; trailing?: React.ReactNode }) {
  const { colors } = useTheme();
  const [show, setShow] = React.useState(false);
  const isPassword = secure && !show;
  return (
    <View style={{ marginBottom: spacing(3.5) }}>
      {label ? (
        <Text style={{ color: colors.textSub, fontSize: 13, fontWeight: '600', marginBottom: spacing(1.5), letterSpacing: 0.3 }}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface2,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          paddingHorizontal: spacing(3),
        }}
      >
        <TextInput
          placeholderTextColor={colors.textFaint}
          secureTextEntry={isPassword}
          style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: spacing(2.8) }}
          {...props}
        />
        {secure ? (
          <PressableScale haptic="selection" onPress={() => setShow((s) => !s)} style={{ padding: 6 }}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSub} />
          </PressableScale>
        ) : trailing}
      </View>
      {hint ? <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: spacing(1) }}>{hint}</Text> : null}
    </View>
  );
}

/* ---------------------------------- Button ----------------------------------- */

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg =
    variant === 'primary' ? colors.accent
    : variant === 'danger' ? colors.dangerSoft
    : variant === 'secondary' ? colors.surface2
    : 'transparent';
  const fg =
    variant === 'primary' ? colors.onAccent
    : variant === 'danger' ? colors.danger
    : variant === 'secondary' ? colors.text
    : colors.accent;
  return (
    <PressableScale haptic="light" onPress={onPress} disabled={disabled || loading} style={style}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: bg,
          borderRadius: radius.md,
          borderWidth: variant === 'ghost' ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
          paddingVertical: spacing(3.2),
          paddingHorizontal: spacing(4),
          opacity: disabled && !loading ? 0.45 : 1,
        }}
      >
        {loading ? (
          <Animated.View style={{ marginRight: 2 }}>
            <Ionicons name="sync" size={16} color={fg} />
          </Animated.View>
        ) : icon ? (
          <Ionicons name={icon} size={17} color={fg} />
        ) : null}
        <Text style={{ color: fg, fontSize: 15, fontWeight: '700' }}>{label}</Text>
      </View>
    </PressableScale>
  );
}

/* ---------------------------------- Banner ----------------------------------- */

export function Banner({
  kind = 'info',
  text,
  actionLabel,
  onAction,
  onClose,
}: {
  kind?: 'info' | 'warn' | 'error' | 'success';
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}) {
  const { colors } = useTheme();
  const tint =
    kind === 'error' ? colors.danger : kind === 'warn' ? colors.warning : kind === 'success' ? colors.success : colors.accent;
  const icon: keyof typeof Ionicons.glyphMap =
    kind === 'error' ? 'alert-circle' : kind === 'warn' ? 'warning' : kind === 'success' ? 'checkmark-circle' : 'information-circle';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.surface2,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderLeftWidth: 3,
        borderLeftColor: tint,
        borderRadius: radius.md,
        paddingVertical: spacing(2.4),
        paddingHorizontal: spacing(3),
        marginBottom: spacing(2),
      }}
    >
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={{ flex: 1, color: colors.textSub, fontSize: 13.5 }}>{text}</Text>
      {actionLabel && onAction ? (
        <PressableScale haptic="light" onPress={onAction}>
          <Text style={{ color: tint, fontWeight: '700', fontSize: 13.5 }}>{actionLabel}</Text>
        </PressableScale>
      ) : null}
      {onClose ? (
        <PressableScale haptic="light" onPress={onClose}>
          <Ionicons name="close" size={16} color={colors.textFaint} />
        </PressableScale>
      ) : null}
    </View>
  );
}

/* ------------------------------- ListNavItem --------------------------------- */

export function ListNavItem({
  icon,
  iconColor,
  label,
  sublabel,
  value,
  badge,
  onPress,
  last,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  sublabel?: string;
  value?: string;
  badge?: string | number;
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale haptic="light" scale={0.99} opacityOnPress={0.75} onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: spacing(3),
          paddingHorizontal: spacing(1),
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      >
        {icon ? (
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={18} color={iconColor ?? colors.accent} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 15.5, fontWeight: '600' }}>{label}</Text>
          {sublabel ? <Text style={{ color: colors.textFaint, fontSize: 12.5, marginTop: 1 }}>{sublabel}</Text> : null}
        </View>
        {badge !== undefined ? (
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700' }}>{String(badge)}</Text>
          </View>
        ) : null}
        {value ? <Text style={{ color: colors.textFaint, fontSize: 13.5, maxWidth: 140 }} numberOfLines={1}>{value}</Text> : null}
        <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
      </View>
    </PressableScale>
  );
}
