#!/usr/bin/env node
/**
 * Create or verify a hash-checked evidence manifest for a Copper agent
 * evaluation. This deliberately does not score a candidate or expose a
 * holdout's answers: grading belongs to an independent reviewer.
 *
 * Create:
 *   node scripts/package-agent-evaluation-evidence.mjs \
 *     --mode independent --task-id copper-2026-09-05-a \
 *     --start-sha <commit> --end-sha <commit> \
 *     --transcript /secure/eval/transcript.txt \
 *     --tool-log /secure/eval/tools.txt \
 *     --test-log /secure/eval/tests.txt \
 *     --holdout-attestation /secure/eval/holdout-attestation.json \
 *     --reviewer-attestation /secure/eval/reviewer-attestation.json \
 *     --out /secure/eval/evidence.json
 *
 * A self-audit may omit the two independent attestations, but is marked
 * non-certifying in its manifest:
 *   node scripts/package-agent-evaluation-evidence.mjs \
 *     --mode self-audit --task-id local-boundary-audit ...
 *
 * Verify:
 *   node scripts/package-agent-evaluation-evidence.mjs --verify --bundle /secure/eval/evidence.json
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SCHEMA = 'copper.agent-evaluation.evidence.v1';
const SHA256 = /^[a-f0-9]{64}$/i;

function usage(exitCode = 0) {
  const text = `
Usage:
  node scripts/package-agent-evaluation-evidence.mjs \\
    --mode <independent|self-audit> --task-id <opaque-id> \\
    --start-sha <commit> --end-sha <commit> \\
    --transcript <file> --tool-log <file> --test-log <file> --out <bundle.json> \\
    [--holdout-attestation <file> --reviewer-attestation <file>]

  node scripts/package-agent-evaluation-evidence.mjs --verify --bundle <bundle.json>

Independent mode requires both attestations. Keep their referenced private
fixtures, prompts, expected answers, and grading rubric outside this repository.
Self-audit mode is useful for transparency, but is never a production grade.
`;
  console[exitCode === 0 ? 'log' : 'error'](text.trim());
  process.exit(exitCode);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') usage(0);
    if (!token.startsWith('--')) fail(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (name === 'verify') {
      args.verify = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for --${name}`);
    if (Object.hasOwn(args, name)) fail(`Argument --${name} was supplied more than once.`);
    args[name] = value;
    i += 1;
  }
  return args;
}

async function runGit(args, { allowFailure = false } = {}) {
  try {
    const result = await execFileAsync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    if (!allowFailure) {
      const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').trim();
      fail(`git ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`);
    }
    return {
      ok: false,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? error.message ?? ''),
      code: typeof error.code === 'number' ? error.code : 1,
    };
  }
}

function hashBuffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function describeFile(label, candidatePath) {
  const absolutePath = path.resolve(candidatePath);
  let metadata;
  try {
    metadata = await stat(absolutePath);
  } catch {
    fail(`${label} file does not exist: ${absolutePath}`);
  }
  if (!metadata.isFile()) fail(`${label} must be a regular file: ${absolutePath}`);
  const body = await readFile(absolutePath);
  return {
    label,
    path: absolutePath,
    bytes: body.byteLength,
    sha256: hashBuffer(body),
  };
}

async function readAttestation(label, candidatePath, requiredFields) {
  const descriptor = await describeFile(label, candidatePath);
  let parsed;
  try {
    parsed = JSON.parse(await readFile(descriptor.path, 'utf8'));
  } catch {
    fail(`${label} must be valid JSON: ${descriptor.path}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`${label} must contain a JSON object: ${descriptor.path}`);
  }
  for (const field of requiredFields) {
    if (typeof parsed[field] !== 'string' || !parsed[field].trim()) {
      fail(`${label} is missing its required non-empty '${field}' field.`);
    }
  }
  return descriptor;
}

function normaliseSha(value, name) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(`${name} must be a 64-character SHA-256 hex digest.`);
  }
  return value.toLowerCase();
}

async function resolveCommit(revision, name) {
  if (!revision) fail(`--${name} is required.`);
  const result = await runGit(['rev-parse', '--verify', `${revision}^{commit}`]);
  return result.stdout.trim();
}

async function ensureAncestor(startSha, endSha) {
  const result = await runGit(['merge-base', '--is-ancestor', startSha, endSha], { allowFailure: true });
  if (!result.ok) fail(`Start commit ${startSha} is not an ancestor of end commit ${endSha}.`);
}

async function writeAtomically(destination, contents) {
  const absoluteDestination = path.resolve(destination);
  await mkdir(path.dirname(absoluteDestination), { recursive: true });
  const temporary = `${absoluteDestination}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, absoluteDestination);
  return absoluteDestination;
}

async function createBundle(args) {
  const allowed = new Set([
    'mode', 'task-id', 'start-sha', 'end-sha', 'transcript', 'tool-log',
    'test-log', 'holdout-attestation', 'reviewer-attestation', 'out',
  ]);
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) fail(`Unknown argument --${key}. Use --help for usage.`);
  }

  const mode = args.mode;
  if (mode !== 'independent' && mode !== 'self-audit') {
    fail('--mode must be either independent or self-audit.');
  }
  const taskId = args['task-id'];
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(taskId)) {
    fail('--task-id must be 3–128 characters using letters, digits, dot, underscore, colon, or hyphen.');
  }
  for (const key of ['transcript', 'tool-log', 'test-log', 'out']) {
    if (!args[key]) fail(`--${key} is required.`);
  }
  if (mode === 'independent' && (!args['holdout-attestation'] || !args['reviewer-attestation'])) {
    fail('Independent mode requires --holdout-attestation and --reviewer-attestation.');
  }

  const startSha = await resolveCommit(args['start-sha'], 'start-sha');
  const endSha = await resolveCommit(args['end-sha'], 'end-sha');
  await ensureAncestor(startSha, endSha);

  const [transcript, toolLog, testLog] = await Promise.all([
    describeFile('transcript', args.transcript),
    describeFile('tool log', args['tool-log']),
    describeFile('test log', args['test-log']),
  ]);

  let holdoutAttestation;
  let reviewerAttestation;
  if (args['holdout-attestation']) {
    holdoutAttestation = await readAttestation('holdout attestation', args['holdout-attestation'], [
      'schema', 'holdoutId', 'fixtureSha256', 'rubricSha256', 'candidateHadNoFixtureAccess',
    ]);
    const parsed = JSON.parse(await readFile(holdoutAttestation.path, 'utf8'));
    normaliseSha(parsed.fixtureSha256, 'holdout attestation fixtureSha256');
    normaliseSha(parsed.rubricSha256, 'holdout attestation rubricSha256');
    if (parsed.candidateHadNoFixtureAccess !== 'true') {
      fail("holdout attestation candidateHadNoFixtureAccess must be the string 'true'.");
    }
  }
  if (args['reviewer-attestation']) {
    reviewerAttestation = await readAttestation('reviewer attestation', args['reviewer-attestation'], [
      'schema', 'reviewerId', 'reviewerWasIndependent', 'decision',
    ]);
    const parsed = JSON.parse(await readFile(reviewerAttestation.path, 'utf8'));
    if (parsed.reviewerWasIndependent !== 'true') {
      fail("reviewer attestation reviewerWasIndependent must be the string 'true'.");
    }
  }

  const patch = await runGit(['diff', '--binary', `${startSha}..${endSha}`]);
  const diffCheck = await runGit(['diff', '--check', `${startSha}..${endSha}`], { allowFailure: true });
  const remote = await runGit(['config', '--get', 'remote.origin.url'], { allowFailure: true });

  const outputPath = path.resolve(args.out);
  const patchPath = outputPath.replace(/\.json$/i, '') + '.patch';
  const patchContents = patch.stdout;
  await writeAtomically(patchPath, patchContents);

  const evidence = [transcript, toolLog, testLog];
  if (holdoutAttestation) evidence.push(holdoutAttestation);
  if (reviewerAttestation) evidence.push(reviewerAttestation);
  const manifest = {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    mode,
    qualification: mode === 'independent'
      ? 'Evidence package only — an independent reviewer must make the grade decision.'
      : 'Self-audit only — not an independent grade, model identity test, or production certification.',
    taskId,
    repository: {
      origin: remote.ok ? remote.stdout.trim() || null : null,
      startSha,
      endSha,
      ancestryVerified: true,
    },
    candidatePatch: {
      path: patchPath,
      bytes: Buffer.byteLength(patchContents),
      sha256: hashBuffer(patchContents),
      whitespaceCheckPassed: diffCheck.ok,
      whitespaceCheckOutput: [diffCheck.stdout, diffCheck.stderr].filter(Boolean).join('\n').trim() || null,
    },
    evidence,
    independentRequirements: {
      holdoutAttested: Boolean(holdoutAttestation),
      reviewerAttested: Boolean(reviewerAttestation),
      candidateHadNoFixtureAccess: mode === 'independent',
    },
  };

  const manifestPath = await writeAtomically(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Created ${mode} evaluation evidence manifest: ${manifestPath}`);
  console.log(`Patch: ${patchPath}`);
  console.log(`Evidence files hashed: ${evidence.length}`);
  if (mode === 'self-audit') console.log('Qualification: self-audit only; do not use this as an independent grade.');
}

async function verifyBundle(args) {
  if (Object.keys(args).some((key) => key !== 'verify' && key !== 'bundle')) {
    fail('--verify accepts only --bundle.');
  }
  if (!args.bundle) fail('--verify requires --bundle <bundle.json>.');
  const bundlePath = path.resolve(args.bundle);
  let bundle;
  try {
    bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
  } catch {
    fail(`Could not read a valid evidence manifest: ${bundlePath}`);
  }
  if (bundle?.schema !== SCHEMA) fail(`Unsupported evidence manifest schema in ${bundlePath}.`);
  if (!['independent', 'self-audit'].includes(bundle.mode)) fail('Evidence manifest has an invalid mode.');
  if (!bundle.repository?.startSha || !bundle.repository?.endSha || !bundle.candidatePatch?.path) {
    fail('Evidence manifest is missing repository or patch details.');
  }

  const startSha = await resolveCommit(bundle.repository.startSha, 'bundle start SHA');
  const endSha = await resolveCommit(bundle.repository.endSha, 'bundle end SHA');
  if (startSha !== bundle.repository.startSha || endSha !== bundle.repository.endSha) {
    fail('Recorded commits no longer resolve to the expected immutable SHA values.');
  }
  await ensureAncestor(startSha, endSha);

  const currentPatch = (await runGit(['diff', '--binary', `${startSha}..${endSha}`])).stdout;
  if (hashBuffer(currentPatch) !== normaliseSha(bundle.candidatePatch.sha256, 'candidate patch sha256')) {
    fail('Current Git patch hash differs from the evidence manifest.');
  }
  const patchFile = await describeFile('candidate patch', bundle.candidatePatch.path);
  if (patchFile.sha256 !== normaliseSha(bundle.candidatePatch.sha256, 'candidate patch sha256')) {
    fail('Saved candidate patch hash differs from the evidence manifest.');
  }

  if (!Array.isArray(bundle.evidence) || bundle.evidence.length < 3) {
    fail('Evidence manifest must record transcript, tool log, and test log files.');
  }
  for (const descriptor of bundle.evidence) {
    if (!descriptor?.label || !descriptor.path || !descriptor.sha256) fail('Evidence manifest contains an invalid file descriptor.');
    const current = await describeFile(descriptor.label, descriptor.path);
    if (current.sha256 !== normaliseSha(descriptor.sha256, `${descriptor.label} sha256`)) {
      fail(`Evidence file changed after packaging: ${descriptor.label} (${descriptor.path})`);
    }
  }
  if (bundle.mode === 'independent' && (!bundle.independentRequirements?.holdoutAttested || !bundle.independentRequirements?.reviewerAttested)) {
    fail('Independent evidence bundle lacks required attestations.');
  }
  console.log(`Evidence manifest verified: ${bundlePath}`);
  console.log(`Mode: ${bundle.mode}`);
  console.log(`Task: ${bundle.taskId}`);
  console.log(`Patch: ${startSha.slice(0, 12)}..${endSha.slice(0, 12)}`);
  if (bundle.mode === 'self-audit') console.log('Reminder: self-audit is not an independent grade or certification.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.verify) await verifyBundle(args);
  else await createBundle(args);
}

main().catch((error) => {
  console.error(`Evaluation evidence error: ${error.message}`);
  process.exitCode = 1;
});
