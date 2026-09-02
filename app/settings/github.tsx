import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, radius, spacing, SECTION_TINTS } from '@/src/theme';
import { SettingsScaffold, TintSection } from '@/src/components/SettingsScaffold';
import { PressableScale } from '@/src/components/PressableScale';
import { Banner, Button, SwitchRow, TextField } from '@/src/components/ui';
import { Sheet } from '@/src/components/Sheet';
import { useSettingsStore } from '@/src/store/settings';
import { GITHUB_TOOL_SPECS, cloneRepoIntoSandbox, gh, githubReady } from '@/src/agent/github';
import { currentRoot } from '@/src/agent/fs';
import { formatBytes } from '@/src/utils/format';
import { haptic } from '@/src/utils/haptics';

const TINT = SECTION_TINTS.github;

interface RepoRow {
  full_name: string;
  owner: string;
  name: string;
  private: boolean;
  description?: string;
  pushed_at?: string;
  default_branch?: string;
}

export default function GithubSettingsScreen() {
  const { colors } = useTheme();
  const github = useSettingsStore((s) => s.github);
  const patchGithub = useSettingsStore((s) => s.patchGithub);
  const agentScope = useSettingsStore((s) => s.agentScope);
  const patchAgent = useSettingsStore((s) => s.patchAgentScope);

  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [repos, setRepos] = useState<RepoRow[] | null>(null);
  const [repoSheet, setRepoSheet] = useState(false);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branchSheet, setBranchSheet] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setBusy('connect');
    setNote(null);
    try {
      const { json } = await gh('GET', '/user', undefined, { token: github.token });
      let rate = '';
      try {
        const r = await gh('GET', '/rate_limit', undefined, { token: github.token });
        const core = r.json?.resources?.core;
        if (core) rate = ` · ${core.remaining}/${core.limit} API calls left`;
      } catch {
        /* non-fatal */
      }
      patchGithub({ login: json?.login ?? '', connectedAt: Date.now() });
      haptic('success');
      setNote({ kind: 'ok', text: `Connected as @${json?.login ?? '?'} (${json?.plan?.name ?? 'free'})${rate}` });
    } catch (e) {
      haptic('error');
      setNote({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }, [github.token, patchGithub]);

  const loadRepos = useCallback(async () => {
    setBusy('repos');
    setNote(null);
    try {
      const { json } = await gh('GET', '/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member');
      const rows: RepoRow[] = (Array.isArray(json) ? json : []).map((r: any) => ({
        full_name: r.full_name,
        owner: r.owner?.login ?? String(r.full_name).split('/')[0],
        name: r.name,
        private: !!r.private,
        description: r.description ?? undefined,
        pushed_at: r.pushed_at,
        default_branch: r.default_branch,
      }));
      setRepos(rows);
      setRepoSheet(true);
      haptic('navigate');
    } catch (e) {
      haptic('error');
      setNote({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }, []);

  const loadBranches = useCallback(async () => {
    if (!github.owner || !github.repo) {
      setNote({ kind: 'err', text: 'Pick a repository first.' });
      return;
    }
    setBusy('branches');
    try {
      const { json } = await gh('GET', `/repos/${github.owner}/${github.repo}/branches?per_page=100`);
      setBranches((Array.isArray(json) ? json : []).map((b: any) => b.name));
      setBranchSheet(true);
    } catch (e) {
      setNote({ kind: 'err', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }, [github.owner, github.repo]);

  const pull = useCallback(async () => {
    setBusy('pull');
    setNote(null);
    setProgress('Reading tree…');
    const res = await cloneRepoIntoSandbox({
      onProgress: ({ done, total, path }) => setProgress(`${done}/${total} · ${path}`),
    });
    setProgress(null);
    setBusy(null);
    if (res.error) {
      haptic('error');
      setNote({ kind: 'err', text: res.error });
    } else {
      haptic('success');
      setNote({
        kind: 'ok',
        text: `Pulled ${res.files} file(s) (${formatBytes(res.bytes)}) into the ${currentRoot().tier === 'granted' ? 'granted folder' : 'app sandbox'}.${res.skipped ? ` Skipped ${res.skipped} (binary/too large).` : ''}`,
      });
    }
  }, []);

  const disconnect = () => {
    patchGithub({ token: '', login: '', owner: '', repo: '', connectedAt: 0 });
    patchAgent({ githubTools: false });
    setRepos(null);
    setNote({ kind: 'ok', text: 'Disconnected. The token was erased from this device.' });
    haptic('warning');
  };

  return (
    <SettingsScaffold
      title="GitHub"
      subtitle="Connector"
      tint={TINT}
      icon="git-branch-outline"
      intro="Connect a personal access token and the agent can read, commit, branch, open issues and pull requests — straight to your repo, over plain REST. No server, nothing leaves this device except calls to api.github.com."
      right={
        github.login ? (
          <View style={[styles.connectedDot, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="checkmark-circle" size={13} color={colors.success} />
            <Text style={{ color: colors.success, fontSize: 11, fontWeight: '800' }}>@{github.login}</Text>
          </View>
        ) : null
      }
    >
      {note ? (
        <View style={{ marginTop: spacing(3) }}>
          <Banner kind={note.kind === 'ok' ? 'success' : 'error'} text={note.text} onClose={() => setNote(null)} />
        </View>
      ) : null}

      <TintSection title="Authentication" tint={TINT} icon="key-outline">
        <TextField
          label="Personal access token"
          value={github.token}
          onChangeText={(t) => patchGithub({ token: t })}
          placeholder="github_pat_… or ghp_…"
          secure
          autoCapitalize="none"
          autoCorrect={false}
          hint="Classic tokens need the `repo` scope. Fine-grained tokens need Contents (read/write) + Pull requests + Issues on the repositories you choose."
        />
        <View style={{ flexDirection: 'row', gap: spacing(2) }}>
          <Button
            label={busy === 'connect' ? 'Testing…' : 'Test connection'}
            icon="flash-outline"
            style={{ flex: 1 }}
            disabled={!github.token.trim() || busy === 'connect'}
            loading={busy === 'connect'}
            onPress={connect}
          />
          {github.login ? (
            <Button label="Disconnect" variant="danger" style={{ flex: 1 }} onPress={disconnect} />
          ) : null}
        </View>
        <Text style={{ color: colors.textFaint, fontSize: 11.5, marginTop: spacing(2), lineHeight: 16 }}>
          Create one at github.com → Settings → Developer settings → Personal access tokens. It is stored in on-device
          AsyncStorage only.
        </Text>
      </TintSection>

      <TintSection title="Repository" tint={SECTION_TINTS.models} icon="git-network-outline">
        <View style={{ flexDirection: 'row', gap: spacing(2) }}>
          <View style={{ flex: 1 }}>
            <TextField label="Owner" value={github.owner} onChangeText={(t) => patchGithub({ owner: t })} placeholder="your-name" autoCapitalize="none" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Repo" value={github.repo} onChangeText={(t) => patchGithub({ repo: t })} placeholder="your-app" autoCapitalize="none" />
          </View>
        </View>
        <TextField label="Branch" value={github.branch} onChangeText={(t) => patchGithub({ branch: t })} placeholder="main" autoCapitalize="none" />
        <View style={{ flexDirection: 'row', gap: spacing(2) }}>
          <Button label="Choose repo" variant="secondary" icon="search-outline" style={{ flex: 1 }} disabled={!githubReady()} loading={busy === 'repos'} onPress={loadRepos} />
          <Button label="Branches" variant="secondary" icon="git-branch-outline" style={{ flex: 1 }} disabled={!github.owner || !github.repo} loading={busy === 'branches'} onPress={loadBranches} />
        </View>
      </TintSection>

      <TintSection title="Agent tools" tint={SECTION_TINTS.agent} icon="hammer-outline">
        <SwitchRow
          label="Give the agent GitHub tools"
          hint="Adds github_read / github_write / github_tree / github_pr / github_issue to the tool list. Writes ask for confirmation first."
          value={agentScope.githubTools}
          onChange={(v) => {
            patchAgent({ githubTools: v });
            haptic('toggle');
          }}
        />
        <View style={styles.toolGrid}>
          {GITHUB_TOOL_SPECS.map((t) => (
            <View key={t.name} style={[styles.toolChip, { backgroundColor: colors.surface2, borderColor: t.danger ? colors.warning : colors.border }]}>
              <Ionicons name={t.danger ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={11} color={t.danger ? colors.warning : colors.success} />
              <Text style={{ color: colors.textSub, fontSize: 10.5, fontWeight: '700' }}>{t.name.replace('github_', '')}</Text>
            </View>
          ))}
        </View>
      </TintSection>

      <TintSection title="Working copy" tint={SECTION_TINTS.shell} icon="download-outline">
        <Text style={{ color: colors.textSub, fontSize: 12.5, lineHeight: 18, marginBottom: spacing(3) }}>
          Pull the repository into the agent’s storage root so the file tools and the built-in shell can work on real
          source — then commit back with `github_write`. Text files up to 512 KB, first 400 files, binaries skipped.
        </Text>
        <Button
          label={busy === 'pull' ? 'Pulling…' : 'Pull repo into sandbox'}
          icon="cloud-download-outline"
          disabled={!githubReady() || !github.owner || !github.repo || busy === 'pull'}
          loading={busy === 'pull'}
          onPress={pull}
        />
        {progress ? (
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11.5, flex: 1 }}>{progress}</Text>
          </View>
        ) : null}
        <Text style={{ color: colors.textFaint, fontSize: 11.5, marginTop: spacing(2), lineHeight: 16 }}>
          Storage root: {currentRoot().tier === 'granted' ? 'user-granted folder' : 'app sandbox'} ·{' '}
          {Platform.OS === 'android' ? 'grant a folder in Settings → Agent & storage to keep files outside the app.' : 'the app sandbox.'}
        </Text>
      </TintSection>

      {/* repo picker */}
      <Sheet visible={repoSheet} onClose={() => setRepoSheet(false)} title="Your repositories" maxHeight="80%">
        <ScrollView style={{ paddingHorizontal: spacing(4) }} contentContainerStyle={{ paddingBottom: spacing(4) }}>
          {(repos ?? []).map((r) => (
            <PressableScale
              key={r.full_name}
              haptic="select"
              scale={0.99}
              onPress={() => {
                patchGithub({ owner: r.owner, repo: r.name, branch: r.default_branch ?? (github.branch || 'main') });
                setRepoSheet(false);
                setNote({ kind: 'ok', text: `Selected ${r.full_name} (${r.default_branch ?? 'main'})` });
              }}
            >
              <View style={styles.repoRow}>
                <Ionicons name={r.private ? 'lock-closed-outline' : 'globe-outline'} size={15} color={colors.textFaint} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{r.full_name}</Text>
                  {r.description ? <Text numberOfLines={1} style={{ color: colors.textFaint, fontSize: 11.5, marginTop: 1 }}>{r.description}</Text> : null}
                </View>
                <Text style={{ color: colors.textFaint, fontSize: 11 }}>{String(r.pushed_at ?? '').slice(0, 10)}</Text>
              </View>
            </PressableScale>
          ))}
          {!repos?.length ? <Text style={{ color: colors.textFaint, textAlign: 'center', paddingVertical: spacing(8) }}>No repositories found.</Text> : null}
        </ScrollView>
      </Sheet>

      {/* branch picker */}
      <Sheet visible={branchSheet} onClose={() => setBranchSheet(false)} title="Branches">
        <ScrollView style={{ paddingHorizontal: spacing(4), maxHeight: 340 }} contentContainerStyle={{ paddingBottom: spacing(4) }}>
          {(branches ?? []).map((b) => (
            <PressableScale
              key={b}
              haptic="select"
              scale={0.99}
              onPress={() => {
                patchGithub({ branch: b });
                setBranchSheet(false);
              }}
            >
              <View style={styles.repoRow}>
                <Ionicons name="git-branch-outline" size={15} color={colors.textFaint} />
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{b}</Text>
                {b === github.branch ? <Ionicons name="checkmark" size={16} color={colors.accent} /> : null}
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      </Sheet>
    </SettingsScaffold>
  );
}

const styles = StyleSheet.create({
  connectedDot: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 4 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing(2) },
  toolChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing(2.5) },
  repoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2.5),
    paddingVertical: spacing(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.16)',
  },
});
