import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { useTheme } from '@/src/theme';
import { Message, Layers, Sliders } from '@/src/components/Icons';

function TabBarBackground() {
  const { colors, scheme } = useTheme();
  if (Platform.OS === 'web') return null;
  // BlurView is expensive on Android — solid translucency keeps scrolling silky.
  if (Platform.OS === 'android') {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: scheme === 'dark' ? 'rgba(25,24,23,0.96)' : 'rgba(240,238,230,0.97)' }]} />;
  }
  return <BlurView intensity={40} tint={scheme} style={StyleSheet.absoluteFill} pointerEvents="none" />;
}

export default function TabsLayout() {
  const { colors, scheme } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor:
            Platform.OS === 'web'
              ? scheme === 'dark'
                ? 'rgba(25,24,23,0.94)'
                : 'rgba(240,238,230,0.94)'
              : 'transparent',
          elevation: 0,
        },
        tabBarBackground: () => <TabBarBackground />,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          tabBarIcon: ({ focused, color, size }) => (
            <Message size={size - 3} color={String(color)} strokeWidth={focused ? 2.1 : 1.7} />
          ),
        }}
      />
      <Tabs.Screen
        name="providers"
        options={{
          title: 'Providers',
          tabBarIcon: ({ focused, color, size }) => (
            <Layers size={size - 3} color={String(color)} strokeWidth={focused ? 2.1 : 1.7} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused, color, size }) => (
            <Sliders size={size - 3} color={String(color)} strokeWidth={focused ? 2.1 : 1.7} />
          ),
        }}
      />
    </Tabs>
  );
}
