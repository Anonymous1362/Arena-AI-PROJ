/**
 * Where this conversation's work lives on disk.
 *
 * One project folder per chat (the default) means "make me a game" produces
 * `projects/space-game/` with every file inside it — never a pile of loose
 * files at the storage root. Flip Settings → Agent → "One project folder per
 * chat" off and the agent organises freely again.
 */
import { useSettingsStore } from '@/src/store/settings';
import { useProjectsStore } from '@/src/store/projects';
import type { Conversation } from '@/src/store/chats';

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'project'
  );
}

/** Relative project directory for a conversation, or null in free mode. */
export function projectDirFor(conv?: Conversation | null): string | null {
  const scope = useSettingsStore.getState().agentScope;
  if (!scope.projectFolders || !scope.oneProjectPerChat || !conv) return null;
  const proj = conv.projectId
    ? useProjectsStore.getState().projects.find((p) => p.id === conv.projectId)
    : null;
  const name = proj?.name?.trim() || (conv.title !== 'New chat' ? conv.title : '');
  if (!name) return `projects/chat-${conv.id.slice(-6)}`;
  return `projects/${slugify(name)}`;
}
