// Real local React app, isolated API fixtures. Never contacts a production API.
import assert from 'node:assert/strict';
const origin = new URL(process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5190').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = process.env.BROWSER_CDP_URL
  ? await chromium.connectOverCDP(process.env.BROWSER_CDP_URL)
  : await chromium.launch({ headless: true });
const mobile = process.env.ADMIN_TEST_MOBILE === '1';
const context = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
  isMobile: mobile,
  hasTouch: mobile,
});
const now = '2026-09-05T00:00:00Z';
const base = {
  id: 'root',
  username: 'review-admin',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  level: 0,
  parentId: null,
  marketType: 'D',
  balance: '10000.37',
  commissionBalance: '0',
  commissionRate: '0',
  rebateMode: 'PERCENTAGE',
  rebatePercentage: '0',
  maxRebatePercentage: '100',
  baccaratRebateMode: 'PERCENTAGE',
  baccaratRebatePercentage: '0',
  maxBaccaratRebatePercentage: '100',
  bettingLimitLevel: 'range_10_5000',
  bettingLimits: {},
  canManageControlZone: true,
  excludeFromControlSettlement: false,
  createdAt: now,
  lastLoginAt: null,
  notes: null,
};
let operator = { ...base };
const targetAgent = {
  ...base,
  id: 'agent-one',
  username: 'review-agent',
  role: 'AGENT',
  level: 1,
  parentId: 'root',
  kind: 'agent',
  childCount: 0,
  memberCount: 1,
};
const targetMember = {
  ...base,
  id: 'member-one',
  username: 'review-member',
  kind: 'member',
  level: null,
  agentId: 'root',
  agentUsername: base.username,
  frozenAt: null,
  disabledAt: null,
};
const sub = { ...targetAgent, id: 'sub-one', username: 'review-sub', role: 'SUB_ACCOUNT' };
const rowBase = {
  isActive: true,
  isCompleted: false,
  createdAt: now,
  targetMemberUsername: 'review-member',
  targetAgentUsername: null,
  scope: 'MEMBER',
  controlPercentage: 50,
};
const rules = {
  'manual-detection': [
    {
      ...rowBase,
      id: 'manual-one',
      controlMode: 'lifecycle_path',
      lifecycleTemplateKeys: [],
      lifecycleTemplates: [{ key: 'fixture', label: '測試路徑', steps: [80, 0] }],
      lineFreezeThreshold: '50000',
    },
  ],
  deposit: [
    {
      ...rowBase,
      id: 'deposit-one',
      memberUsername: 'review-member',
      depositAmount: '1000',
      targetProfit: '100',
      currentProfit: '0',
      controlWinRate: '0.5',
      notes: null,
    },
    {
      ...rowBase,
      id: 'deposit-done',
      isActive: false,
      isCompleted: true,
      memberUsername: 'completed-member',
      depositAmount: '1000',
      targetProfit: '100',
      controlWinRate: '0.5',
      notes: null,
    },
  ],
  burst: [
    {
      ...rowBase,
      id: 'burst-one',
      gameIds: [],
      dailyBudget: '1000',
      todayBurstAmount: '0',
      todayBurstCount: 0,
      memberDailyCap: '1000',
      singlePayoutCap: '1000',
      singleMultiplierCap: '100',
      minBurstMultiplier: '10',
      smallWinMultiplier: '1',
      burstRate: '1',
      smallWinRate: '0',
      lossRate: '0',
      compensationLoss: '0',
      capitalRetentionRatio: '0',
      minEligibilityLoss: '0',
      riskWinLimit: '1000',
      cooldownRounds: 0,
    },
  ],
  'win-loss': [
    {
      ...rowBase,
      id: 'win-loss-one',
      targetUsername: 'legacy-win-loss',
      controlMode: 'SINGLE_MEMBER',
      targetBitePercentage: '10',
      winControl: true,
      lossControl: false,
    },
  ],
  'win-cap': [
    {
      ...rowBase,
      id: 'win-cap-one',
      memberUsername: 'legacy-win-cap',
      winCapAmount: '1000',
      todayWinAmount: '0',
      controlWinRate: '0.5',
      triggerThreshold: '0.9',
    },
  ],
  'agent-line': [
    {
      ...rowBase,
      id: 'agent-line-one',
      agentUsername: 'legacy-agent-line',
      dailyCap: '1000',
      todayWinAmount: '0',
      controlWinRate: '0.5',
      triggerThreshold: '0.9',
    },
  ],
};
const initialRules = structuredClone(rules);
let announcements = [
  {
    id: 'announcement-one',
    content: '測試公告',
    kind: 'marquee',
    priority: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    createdAt: now,
  },
];
const writes = [];
const pageErrors = [];
let held = null;
let holdNext = false;
let failNext = false;
let disconnectNext = false;
let failRead = false;
let failSearch = false;
let failAuthAfterTransfer = false;
let transferCommitted = false;
let loseTransferResponse = false;
let checks = 0;
await context.addInitScript((agent) => {
  if (!localStorage.getItem('bg-qmoney-admin-auth'))
    localStorage.setItem(
      'bg-qmoney-admin-auth',
      JSON.stringify({
        state: { agent, accessToken: 'isolated', refreshToken: 'isolated' },
        version: 0,
      }),
    );
  localStorage.setItem('bg.qmoney.admin.locale', 'zh-Hant');
}, operator);
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  const path = url.pathname.replace('/api/admin', '');
  const method = route.request().method();
  const respond = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: status === 204 ? '' : JSON.stringify(data),
    });
  if (method !== 'GET') {
    const body = route.request().postData() ? route.request().postDataJSON() : null;
    writes.push({ method, path, body });
    if (disconnectNext) {
      disconnectNext = false;
      return route.abort('failed');
    }
    if (holdNext) {
      holdNext = false;
      await new Promise((resolve) => {
        held = resolve;
      });
    }
    if (failNext) {
      failNext = false;
      return respond({ code: 'FORBIDDEN', message: '測試：此規則無法操作' }, 403);
    }
    if (path.includes('/manual-detection/')) {
      const id = body?.id || path.split('/')[3];
      const row = rules['manual-detection'].find((r) => r.id === id);
      if (method === 'DELETE')
        rules['manual-detection'] = rules['manual-detection'].filter((r) => r.id !== id);
      else if (row) row.isActive = !path.endsWith('/deactivate');
      return respond(row || {}, method === 'DELETE' ? 204 : 200);
    }
    if (path.startsWith('/controls/')) {
      const [, , kind, id] = path.split('/');
      const row = rules[kind]?.find((r) => r.id === id);
      if (method === 'DELETE') rules[kind] = rules[kind].filter((r) => r.id !== id);
      else if (row) row.isActive = body.isActive;
      return respond(row || {}, method === 'DELETE' ? 204 : 200);
    }
    if (path.startsWith('/announcements/')) {
      const id = path.split('/')[2];
      if (method === 'DELETE') announcements = announcements.filter((r) => r.id !== id);
      else
        Object.assign(
          announcements.find((r) => r.id === id),
          body,
        );
      return respond({}, method === 'DELETE' ? 204 : 200);
    }
    if (path.startsWith('/transfers/')) {
      transferCommitted = true;
      if (loseTransferResponse) return route.abort('failed');
    }
    if (path.endsWith('/status')) {
      const target = path.startsWith('/agents/')
        ? targetAgent
        : path.startsWith('/members/')
          ? targetMember
          : sub;
      target.status = body.status;
    }
    return respond({ ...targetMember, ...body });
  }
  if (path === '/auth/me') {
    if (failAuthAfterTransfer && transferCommitted)
      return respond({ code: 'INTERNAL', message: '測試：餘額同步失敗' }, 503);
    return respond(operator);
  }
  if (path.endsWith('/search')) {
    if (failSearch) return respond({ code: 'INTERNAL', message: '搜尋暫時失敗' }, 503);
    return respond({ items: [path.startsWith('/agents') ? targetAgent : targetMember] });
  }
  if (path === '/hierarchy')
    return respond({
      parent: operator,
      breadcrumb: [{ id: operator.id, username: operator.username, level: operator.level }],
      items: [targetAgent, targetMember],
      stats: { agentCount: 1, memberCount: 1 },
    });
  if (path.startsWith('/agents/')) return respond(path.endsWith('/root') ? operator : targetAgent);
  if (path.startsWith('/members/')) return respond(targetMember);
  if (path === '/subaccounts') return respond({ items: [sub], parentUsername: operator.username });
  if (path === '/announcements') return respond({ items: announcements });
  if (path.startsWith('/controls/')) {
    if (failRead) return respond({ code: 'INTERNAL', message: '列表刷新失敗' }, 503);
    if (path.endsWith('/status')) return respond({ items: rules['manual-detection'] });
    if (path.endsWith('/config'))
      return respond({
        id: 'config',
        isEnabled: true,
        templateKey: 'fixture',
        templateLabel: 'fixture',
        secondLineAmount: '50000',
        templates: [{ key: 'fixture', label: '測試路徑', steps: [80, 0] }],
      });
    if (path.endsWith('/settlement'))
      return respond({ totalBet: '0', totalPayout: '0', memberWinLoss: '0', totalRebate: '0' });
    return respond({ items: rules[path.split('/')[2]] || [] });
  }
  return respond({ items: [], total: 0 });
});
const page = await context.newPage();
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('dialog', (dialog) => dialog.accept());
async function until(test) {
  for (let i = 0; i < 150; i++) {
    if (await test()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail('Expected API event did not occur');
}
async function go(path) {
  await page.goto(origin + '/admin/' + path);
}
const rowFor = (text) => page.locator('tbody tr').filter({ hasText: text });
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
async function release() {
  const finish = held;
  held = null;
  assert.ok(finish);
  finish();
}
async function setOperator(next) {
  operator = { ...base, ...next };
  await page.evaluate(
    (agent) =>
      localStorage.setItem(
        'bg-qmoney-admin-auth',
        JSON.stringify({
          state: { agent, accessToken: 'isolated', refreshToken: 'isolated' },
          version: 0,
        }),
      ),
    operator,
  );
}
try {
  await go('controls');
  await page.getByText('既有控制規則管理', { exact: true }).click();
  if (mobile)
    await page.screenshot({ path: '/tmp/admin-controls-mobile-review.png', fullPage: true });
  const cases = [
    ['manual-detection', 'manual-one', 'review-member'],
    ['deposit', 'deposit-one', 'review-member'],
    ['burst', 'burst-one', 'review-member'],
    ['win-loss', 'win-loss-one', 'legacy-win-loss'],
    ['win-cap', 'win-cap-one', 'legacy-win-cap'],
    ['agent-line', 'agent-line-one', 'legacy-agent-line'],
  ];
  for (const [kind, id, target] of cases) {
    // Scope rows by their actual outgoing rule identity via the accessible delete dialog label.
    const section =
      kind === 'manual-detection'
        ? page.locator('table').nth(0)
        : kind === 'deposit'
          ? page.locator('table').nth(1)
          : kind === 'burst'
            ? page.locator('table').nth(2)
            : page.locator('details');
    const row = section.locator('tbody tr').filter({ hasText: target }).first();
    const count = writes.length;
    holdNext = true;
    await button(row, '停用').click();
    await until(() => held !== null);
    assert.ok(await button(row, '停用').isDisabled());
    assert.ok(await button(row, '刪除').isDisabled());
    assert.equal(writes.length, count + 1);
    assert.equal(writes.at(-1).method, kind === 'manual-detection' ? 'POST' : 'PATCH');
    assert.equal(
      writes.at(-1).path,
      kind === 'manual-detection'
        ? '/controls/manual-detection/deactivate'
        : `/controls/${kind}/${id}/toggle`,
    );
    await release();
    await button(row, '啟用').waitFor();
    await button(row, '啟用').click();
    await button(row, '停用').waitFor();
    const beforeDelete = writes.length;
    await button(row, '刪除').dblclick();
    const dialog = page.getByRole('dialog');
    assert.equal(writes.length, beforeDelete, 'double-clicking Delete cannot confirm deletion');
    if (!(await dialog.isVisible())) await button(row, '刪除').click();
    await dialog.waitFor();
    await button(dialog, '取消').click();
    assert.equal(writes.length, beforeDelete);
    await button(row, '刪除').click();
    holdNext = true;
    await button(page.getByRole('dialog'), '確認刪除').click();
    await until(() => held !== null);
    await page.keyboard.press('Escape');
    assert.ok(
      await page.getByRole('dialog').isVisible(),
      'Escape cannot interrupt a pending delete',
    );
    await release();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(writes.at(-1).method, 'DELETE');
    assert.equal(writes.at(-1).path, `/controls/${kind}/${id}`);
    assert.ok(!rules[kind].some((r) => r.id === id));
    checks++;
  }
  assert.ok(await button(rowFor('completed-member'), '已完成').isDisabled());
  checks++;
  Object.assign(rules, structuredClone(initialRules));
  await go('controls');
  let row = page.locator('table').nth(1).locator('tbody tr').filter({ hasText: 'review-member' });
  failNext = true;
  await button(row, '停用').click();
  await page.getByText('測試：此規則無法操作', { exact: false }).waitFor();
  assert.ok(await button(row, '停用').isEnabled(), 'failed toggle restores controls');
  await button(row, '刪除').click();
  failNext = true;
  await button(page.getByRole('dialog'), '確認刪除').click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  await button(page.getByRole('dialog'), '取消').click();
  checks++;
  await button(row, '刪除').click();
  disconnectNext = true;
  await button(page.getByRole('dialog'), '確認刪除').click();
  await page.getByRole('dialog').getByText('無法連線或確認操作結果。', { exact: false }).waitFor();
  assert.ok(await button(page.getByRole('dialog'), '取消').isEnabled());
  await button(page.getByRole('dialog'), '取消').click();
  assert.ok(
    await button(row, '停用').isEnabled(),
    'network failure does not remove the rule locally',
  );
  checks++;
  failRead = true;
  await button(row, '停用').click();
  await page.getByText('列表更新失敗，請重新整理', { exact: false }).waitFor();
  assert.ok(
    await button(row, '啟用').isEnabled(),
    'committed toggle remains applied when reload fails',
  );
  failRead = false;
  checks++;

  // Real form flow: API rejection is readable, the modal cannot close while submitting.
  await page.getByRole('button', { name: '+ 新增', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  const create = button(dialog, '建立路徑控制');
  await until(async () => await create.isEnabled());
  holdNext = true;
  failNext = true;
  const beforeCreate = writes.length;
  await create.evaluate((node) => {
    node.click();
    node.click();
  });
  await until(() => held !== null);
  assert.equal(writes.length, beforeCreate + 1);
  assert.equal(writes.at(-1).path, '/controls/manual-detection/activate');
  await page.keyboard.press('Escape');
  assert.ok(await dialog.isVisible());
  assert.ok(await button(dialog, '取消').isDisabled());
  await release();
  await dialog.getByText('測試：此規則無法操作').waitFor();
  await button(dialog, '取消').click();
  checks++;

  await page.getByRole('button', { name: '+ 新增', exact: true }).nth(1).click();
  dialog = page.getByRole('dialog');
  failSearch = true;
  await dialog.locator('.account-search-select input').fill('review');
  await button(dialog, '重新搜尋').waitFor();
  failSearch = false;
  await button(dialog, '重新搜尋').click();
  await dialog
    .locator('.account-search-select button')
    .filter({ hasText: 'review-member' })
    .click();
  holdNext = true;
  await dialog
    .getByRole('button', { name: /建立|新增|保存|儲存|設定/ })
    .last()
    .click();
  await until(() => held !== null);
  assert.equal(writes.at(-1).path, '/controls/deposit');
  assert.equal(writes.at(-1).body.memberId, 'member-one');
  await release();
  await dialog.waitFor({ state: 'hidden' });
  checks++;

  await go('announcements');
  row = rowFor('測試公告');
  await button(row, '停用').click();
  await button(row, '啟用').waitFor();
  assert.equal(writes.at(-1).path, '/announcements/announcement-one/toggle');
  await button(row, '刪除').click();
  await button(page.getByRole('dialog'), '確認刪除').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(writes.at(-1).method, 'DELETE');
  checks++;

  await go('accounts');
  await page.locator('.account-hierarchy-actions').first().waitFor();
  const accountRows = page.locator('.account-hierarchy-actions');
  const firstActions = accountRows.first();
  for (const label of [/退水/, /限紅/, /重設密碼/, /備註/]) {
    await firstActions.getByRole('button', { name: label }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    checks++;
  }
  for (const [index, prefix] of [
    [0, '/agents/agent-one'],
    [1, '/members/member-one'],
  ]) {
    for (const operation of ['notes', 'reset-password']) {
      const actions = accountRows.nth(index);
      await actions
        .getByRole('button', { name: operation === 'notes' ? /備註/ : /重設密碼/ })
        .click();
      dialog = page.getByRole('dialog');
      if (operation === 'notes') await dialog.locator('textarea').fill('isolated review note');
      else
        for (const input of await dialog.locator('input[type="password"]').all())
          await input.fill('ReviewOnly123');
      const count = writes.length;
      holdNext = true;
      await dialog.locator('button[type="submit"]').evaluate((node) => {
        node.click();
        node.click();
      });
      await until(() => held !== null);
      assert.equal(writes.length, count + 1);
      assert.equal(
        writes.at(-1).path,
        operation === 'notes' && index === 0 ? prefix : `${prefix}/${operation}`,
      );
      assert.equal(writes.at(-1).method, operation === 'notes' ? 'PUT' : 'POST');
      await release();
      await dialog.waitFor({ state: 'hidden' });
      checks++;
    }
  }
  await firstActions.getByRole('button', { name: /狀態|狀态/ }).click();
  await page.getByRole('button', { name: /凍結/, exact: true }).click();
  await until(() => writes.at(-1)?.path === '/agents/agent-one/status');
  assert.equal(writes.at(-1).body.status, 'FROZEN');
  checks++;

  // Exercise shared production dialogs directly as well as their page entry points.
  async function mountDialog(name, props) {
    await page.evaluate(
      async ({ name, props }) => {
        window.__reviewModalRoot?.unmount();
        const reactModule = await import('/node_modules/.vite/deps/react.js');
        const React = reactModule.default ?? reactModule;
        const clientModule = await import('/node_modules/.vite/deps/react-dom_client.js');
        const createRoot = clientModule.createRoot ?? clientModule.default.createRoot;
        const module = await import(`/src/components/shared/${name}.tsx`);
        const host = document.createElement('div');
        document.body.append(host);
        const root = createRoot(host);
        window.__reviewModalRoot = root;
        root.render(
          React.createElement(module[name], {
            ...props,
            open: true,
            onClose: () => {
              root.unmount();
              host.remove();
            },
            onDone: () => {},
            onCreated: () => {},
          }),
        );
      },
      { name, props },
    );
    await page.getByRole('dialog').waitFor();
    return page.getByRole('dialog');
  }
  for (const [name, props, endpoint] of [
    ['CreateMemberModal', { lockedAgent: operator, defaultAgentId: 'root' }, '/members'],
    ['CreateAgentModal', { lockedParent: operator, defaultParentId: 'root' }, '/agents'],
    [
      'CreateSubAccountModal',
      { parentUsername: operator.username, parentAgentId: 'root' },
      '/subaccounts',
    ],
  ]) {
    dialog = await mountDialog(name, props);
    await dialog.locator('input[name="username"]').fill('review-created');
    await dialog.locator('input[name="password"]').fill('ReviewOnly123');
    if (await dialog.locator('input[name="confirmPassword"]').count())
      await dialog.locator('input[name="confirmPassword"]').fill('ReviewOnly123');
    const count = writes.length;
    holdNext = true;
    await dialog.locator('button[type="submit"]').evaluate((node) => {
      node.click();
      node.click();
    });
    await until(() => held !== null);
    assert.equal(writes.length, count + 1);
    assert.equal(writes.at(-1).path, endpoint);
    await page.keyboard.press('Escape');
    assert.ok(await dialog.isVisible());
    await release();
    await dialog.waitFor({ state: 'hidden' });
    checks++;
  }

  dialog = await mountDialog('RebateSettingModal', {
    agentId: targetAgent.id,
    agentUsername: targetAgent.username,
  });
  await dialog.getByRole('button', { name: /保存|儲存/ }).waitFor();
  const rebateCount = writes.length;
  await dialog.getByRole('button', { name: /保存|儲存/ }).click();
  await until(() => writes.length === rebateCount + 1);
  assert.equal(writes.at(-1).path, '/agents/agent-one/rebate');
  await dialog.waitFor({ state: 'hidden' });
  checks++;

  for (const [name, props, path] of [
    [
      'TransferModal',
      { member: targetMember, sourceAgent: operator },
      '/transfers/agent-to-member',
    ],
    ['AgentTransferModal', { sourceAgent: operator, targetAgent }, '/transfers/agent-to-agent'],
  ]) {
    transferCommitted = false;
    failAuthAfterTransfer = false;
    dialog = await mountDialog(name, props);
    const amount = dialog.locator('input[name="amount"], input[placeholder="0.00"]');
    await amount.fill('0.005');
    const confirm = dialog.getByRole('button', { name: /確認轉帳/ });
    const beforeInvalid = writes.length;
    if (await confirm.isEnabled()) await confirm.click();
    assert.equal(writes.length, beforeInvalid, 'sub-cent amounts cannot be transferred');
    await amount.fill('10.37');
    failAuthAfterTransfer = true;
    holdNext = true;
    const count = writes.length;
    await confirm.click();
    await until(() => held !== null);
    assert.equal(writes.at(-1).path, path);
    assert.equal(writes.length, count + 1);
    await page.keyboard.press('Escape');
    assert.ok(await dialog.isVisible());
    await release();
    await dialog.getByText('轉帳已完成，但餘額畫面刷新失敗', { exact: false }).waitFor();
    assert.ok(
      await confirm.isDisabled(),
      'a committed transfer cannot be resubmitted after GET fails',
    );
    failAuthAfterTransfer = false;
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    checks++;
  }

  for (const [name, props] of [
    ['TransferModal', { member: targetMember, sourceAgent: operator }],
    ['AgentTransferModal', { sourceAgent: operator, targetAgent }],
  ]) {
    // A failed initial balance read is not a submitted transfer.
    transferCommitted = true;
    failAuthAfterTransfer = true;
    const beforeInitialRead = writes.length;
    dialog = await mountDialog(name, props);
    await dialog.getByText('測試：餘額同步失敗', { exact: true }).waitFor();
    assert.equal(writes.length, beforeInitialRead);
    assert.equal(await dialog.getByText('轉帳結果尚未確認', { exact: false }).count(), 0);
    failAuthAfterTransfer = false;
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });

    loseTransferResponse = true;
    dialog = await mountDialog(name, props);
    await dialog.locator('input[name="amount"], input[placeholder="0.00"]').fill('10');
    const uncertainSubmit = dialog.getByRole('button', { name: /確認轉帳/ });
    const beforeUncertain = writes.length;
    await uncertainSubmit.click();
    await dialog.getByText('轉帳結果尚未確認', { exact: false }).waitFor();
    assert.ok(await uncertainSubmit.isDisabled());
    assert.equal(writes.length, beforeUncertain + 1);
    loseTransferResponse = false;
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    checks++;
  }

  for (const identity of [
    { role: 'SUB_ACCOUNT', canManageControlZone: false },
    { role: 'AGENT', status: 'FROZEN' },
  ]) {
    await setOperator(identity);
    await go('accounts');
    await page.getByText('目前帳號為唯讀', { exact: false }).waitFor();
    assert.ok(await page.getByRole('button', { name: /新增會員/ }).isDisabled());
    for (const action of await page.locator('.account-hierarchy-actions button').all())
      assert.ok(await action.isDisabled());
    const before = writes.length;
    const rejected = await page.evaluate(async () => {
      const { adminApi } = await import('/src/lib/adminApi.ts');
      try {
        await adminApi.patch('/members/member-one/status', { status: 'DISABLED' });
        return false;
      } catch {
        return true;
      }
    });
    assert.ok(rejected);
    assert.equal(writes.length, before);
    await go('subaccounts');
    await page.getByText('只讀', { exact: false }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: /新增子帳號|重設密碼/ }).count(), 0);
    checks++;
  }
  assert.deepEqual(pageErrors, []);
  console.log(
    JSON.stringify({ checks, writes: writes.length, mobile, realReact: true, isolatedApi: true }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      checks,
      lastWrites: writes.slice(-4),
      pageErrors,
      text: (await page.locator('body').innerText()).slice(-4500),
    }),
  );
  await page.screenshot({ path: '/tmp/admin-actions-review-failure.png', fullPage: true });
  throw error;
} finally {
  if (held) held();
  await context.close();
  await browser.close();
}
