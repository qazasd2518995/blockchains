import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '../..');

const routeFiles = new Map([
  ['auth/adminAuth.routes.ts', '/auth'],
  ['hierarchy/hierarchy.routes.ts', '/hierarchy'],
  ['agents/agent.routes.ts', '/agents'],
  ['members/member.routes.ts', '/members'],
  ['transfers/transfer.routes.ts', '/transfers'],
  ['reports/report.routes.ts', '/reports'],
  ['controls/controls.routes.ts', '/controls'],
  ['audit/audit.routes.ts', '/audit'],
  ['subaccounts/subaccount.routes.ts', '/subaccounts'],
  ['announcements/announcement.routes.ts', '/announcements'],
]);

const sourceFiles = (await walk(path.join(appRoot, 'src'))).filter((file) =>
  /\.(ts|tsx)$/.test(file),
);
const clientCalls = [];
let buttonCount = 0;
let formCount = 0;

for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  const callPattern = /adminApi\.(get|post|put|patch|delete)(?:<[^;\n]+?>)?\(\s*([`'"])(.*?)\2/gs;
  for (const match of source.matchAll(callPattern)) {
    clientCalls.push({
      method: match[1].toUpperCase(),
      path: normalizePath(match[3]),
      file: path.relative(repoRoot, file),
    });
  }

  if (!file.endsWith('.tsx')) continue;
  for (const match of source.matchAll(/<button\b[\s\S]*?>/g)) {
    buttonCount += 1;
    const tag = match[0];
    const location = `${path.relative(repoRoot, file)}:${lineNumber(source, match.index)}`;
    assert.match(tag, /\btype\s*=/, `${location} button must declare an explicit type`);
    if (/type\s*=\s*['"]button['"]/.test(tag)) {
      assert.match(
        tag,
        /on(?:Click|Pointer\w*|Mouse\w*|Key\w*)\s*=/,
        `${location} type=button must have an interaction handler`,
      );
    }
  }
  for (const match of source.matchAll(/<form\b[\s\S]*?>/g)) {
    formCount += 1;
    const location = `${path.relative(repoRoot, file)}:${lineNumber(source, match.index)}`;
    assert.match(match[0], /onSubmit\s*=/, `${location} form must have a submit handler`);
  }
}

const serverRoutes = [];
for (const [relativeFile, prefix] of routeFiles) {
  const file = path.join(repoRoot, 'apps/server/src/modules/admin', relativeFile);
  const source = await readFile(file, 'utf8');
  const routePattern = /fastify\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g;
  for (const match of source.matchAll(routePattern)) {
    serverRoutes.push({
      method: match[1].toUpperCase(),
      path: normalizePath(`${prefix}/${match[3]}`),
      file: path.relative(repoRoot, file),
    });
  }
}

assert.ok(clientCalls.length > 50, 'admin API scan unexpectedly found too few client calls');
assert.ok(serverRoutes.length > 50, 'admin API scan unexpectedly found too few server routes');
assert.ok(buttonCount > 100, 'admin UI scan unexpectedly found too few native buttons');
assert.ok(formCount > 5, 'admin UI scan unexpectedly found too few forms');

const missingRoutes = clientCalls.filter(
  (call) =>
    !serverRoutes.some(
      (route) => route.method === call.method && routeMatches(call.path, route.path),
    ),
);
assert.deepEqual(
  missingRoutes,
  [],
  `admin client calls without matching server routes:\n${missingRoutes
    .map((call) => `${call.method} ${call.path} (${call.file})`)
    .join('\n')}`,
);

console.log(
  `[admin-contract] ${clientCalls.length} API calls, ${serverRoutes.length} server routes, ` +
    `${buttonCount} buttons and ${formCount} forms verified.`,
);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    }),
  );
  return files.flat();
}

function normalizePath(value) {
  const normalized = `/${value}`
    .replace(/\/+/g, '/')
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/:[A-Za-z0-9_]+/g, ':param')
    .replace(/\/$/, '');
  return normalized || '/';
}

function routeMatches(clientPath, serverPath) {
  const clientSegments = clientPath.split('/');
  const serverSegments = serverPath.split('/');
  return (
    clientSegments.length === serverSegments.length &&
    clientSegments.every(
      (segment, index) =>
        segment === ':param' ||
        serverSegments[index] === ':param' ||
        segment === serverSegments[index],
    )
  );
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}
