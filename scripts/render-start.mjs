#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prismaCli = resolve(repoRoot, 'apps/server/node_modules/.bin/prisma');
const prismaSchema = resolve(repoRoot, 'apps/server/prisma/schema.prisma');
const migrateAttempts = positiveInt(process.env.RENDER_MIGRATE_ATTEMPTS, 10);
const migrateRetryMs = positiveInt(process.env.RENDER_MIGRATE_RETRY_MS, 5000);

let activeChild;
let receivedSignal;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    receivedSignal = signal;
    console.log(`[render-start] Received ${signal}; forwarding to child process.`);
    if (activeChild && !activeChild.killed) {
      activeChild.kill(signal);
      return;
    }
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
    });
    activeChild = child;

    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (activeChild === child) {
        activeChild = undefined;
      }
      const exitSignal = signal ?? receivedSignal;
      if (exitSignal) {
        resolveRun(exitSignal === 'SIGINT' ? 130 : 143);
        return;
      }
      resolveRun(code ?? 1);
    });
  });
}

for (let attempt = 1; attempt <= migrateAttempts; attempt += 1) {
  console.log(`[render-start] Running Prisma migrations (${attempt}/${migrateAttempts}).`);
  const code = await run(prismaCli, ['migrate', 'deploy', '--schema', prismaSchema]);
  if (receivedSignal) {
    process.exit(code);
  }
  if (code === 0) {
    console.log('[render-start] Prisma migrations completed.');
    break;
  }

  if (attempt === migrateAttempts) {
    console.error(`[render-start] Prisma migrations failed after ${migrateAttempts} attempts.`);
    process.exit(code);
  }

  const waitMs = Math.min(migrateRetryMs * attempt, 30000);
  console.warn(`[render-start] Migration failed with exit code ${code}; retrying in ${waitMs}ms.`);
  await sleep(waitMs);
}

console.log('[render-start] Starting API server.');
const serverExitCode = await run('node', ['apps/server/dist/index.js']);
process.exit(serverExitCode);
