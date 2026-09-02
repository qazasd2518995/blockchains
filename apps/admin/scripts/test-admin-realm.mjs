import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '../..');

const [
  renderConfig,
  qmoneyBrand,
  authStore,
  shareModal,
  viteConfig,
  qmoneySeed,
  hierarchyPage,
  sidebar,
  adminShell,
  globalStyles,
] = await Promise.all([
  read('render.yaml', repoRoot),
  read('src/brand/qmoney.ts', appRoot),
  read('src/stores/adminAuthStore.ts', appRoot),
  read('src/components/shared/AccountCreationShareModal.tsx', appRoot),
  read('vite.config.ts', appRoot),
  read('apps/server/prisma/seed-qmoney.ts', repoRoot),
  read('src/pages/agents/AgentHierarchyPage.tsx', appRoot),
  read('src/components/layout/Sidebar.tsx', appRoot),
  read('src/components/layout/AdminShell.tsx', appRoot),
  read('src/styles/global.css', appRoot),
]);

assertContains(qmoneyBrand, [
  "realm: 'qmoney'",
  "sessionStorageKey: 'bg-qmoney-admin-auth'",
  "localeStorageKey: 'bg.qmoney.admin.locale'",
  "shareHeading: '金寶寶娛樂城推廣連結'",
  'https://bg-qmoney-production.up.railway.app',
  'https://bg-qmoney-admin-production.up.railway.app',
]);
assertContains(authStore, ['adminBrand.sessionStorageKey']);
assertContains(shareModal, [
  'adminBrand.shareHeading',
  'adminBrand.playerLoginUrls',
  'adminBrand.agentLoginUrls',
]);
assertNotContains(shareModal, ['yachiyo', '八千代', '錢女友']);
assertContains(viteConfig, [
  "env.VITE_ADMIN_REALM === 'qmoney'",
  'apiRealm !== realm',
  './src/brand/${realm}.ts',
]);
assertContains(renderConfig, [
  'name: bg-qmoney-api',
  'name: bg-qmoney-admin',
  'name: bg-qmoney-db',
  'value: https://bg-qmoney-api.onrender.com',
  'value: https://bg-qmoney.onrender.com,https://bg-qmoney-admin.onrender.com',
  'key: VITE_ADMIN_REALM',
  'key: VITE_API_REALM',
  'key: SUPER_ADMIN_USERNAME',
  'key: SUPER_ADMIN_PASSWORD',
]);
assertContains(qmoneySeed, [
  "requiredEnv('SUPER_ADMIN_USERNAME')",
  "requiredEnv('SUPER_ADMIN_PASSWORD')",
  'bcrypt.hash(superPassword, BCRYPT_ROUNDS)',
  "displayName: '金寶寶總代理'",
  'username: { not: superUsername }',
]);
assertNotContains(qmoneySeed, ['sourceAdmin.passwordHash', 'sourceSuperAdmins']);
assertContains(hierarchyPage, [
  'const openBalanceTransfer = (row: HierarchyItem): void =>',
  'onClick={() => openBalanceTransfer(row)}',
  'onClick={() => selectParent(row.id)}',
  'setAgentTransferFor({',
  'if (member) setTransferFor(member);',
  "me?.role === 'SUPER_ADMIN' && me.status === 'ACTIVE' ? me : null",
  'const canCreateSubAgent = creationParent ? creationParent.level < 15 : false;',
  'account-hierarchy-actions',
]);
assertNotContains(hierarchyPage, [
  'const onRowClick = (row: HierarchyItem)',
  'onClick={() => onRowClick(row)}',
]);
assertContains(sidebar, [
  "{ to: '/admin/transfers', key: 'transfers' }",
  "{ to: '/admin/audit', key: 'audit' }",
  "{ to: '/admin/controls', key: 'controls', controlManagerOnly: true }",
  'admin-nav-footer',
  't.common.logoutAndSwitch',
]);
assertNotContains(sidebar, ['mt-auto hidden border-t']);
assertContains(adminShell, [
  'const sessionRefreshToken = refreshToken;',
  'logout();',
  "navigate('/admin/login', { replace: true });",
  't.common.logoutAndSwitch',
  '<Sidebar onLogout={handleLogout} />',
]);
assertContains(globalStyles, [
  "html[data-admin-realm='qmoney'] .admin-page-header .btn-teal-outline",
  'grid-template-areas:',
  "'actions actions actions'",
  'overflow: visible !important;',
  '.admin-shell .admin-nav-footer',
]);

console.log(
  '[admin-test] realm isolation, navigation parity, control delegation, and mobile hierarchy actions verified.',
);

async function read(relativePath, root) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function assertContains(content, needles) {
  for (const needle of needles) {
    if (!content.includes(needle)) throw new Error(`Expected content to include: ${needle}`);
  }
}

function assertNotContains(content, needles) {
  for (const needle of needles) {
    if (content.toLocaleLowerCase().includes(needle.toLocaleLowerCase())) {
      throw new Error(`Expected content not to include: ${needle}`);
    }
  }
}
