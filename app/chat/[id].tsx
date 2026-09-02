import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/src/theme';
import { useChatsStore } from '@/src/store/chats';
import { ChatSurface } from '@/src/components/ChatSurface';

/**
 * Pushed conversation route. All of the actual UI lives in `ChatSurface`, which
 * is the same component the Chat tab renders inline — one implementation, two
 * entry points, identical behaviour.
 */
export default function ChatScreen() {
  const { id, prefill } = useLocalSearchParams<{ id: string; prefill?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const exists = useChatsStore((s) => s.conversations.some((c) => c.id === id));

  const onBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  if (!id || !exists) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return <ChatSurface conversationId={id} onBack={onBack} initialText={prefill} />;
}
