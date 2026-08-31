import bcrypt from 'bcrypt';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  blackjackDealerShouldHit,
  blackjackDeck,
  blackjackScore,
  chickenRoadMultiplier,
  chickenRoadPath,
  crashPoint,
  diceDetermine,
  diceMultiplier,
  fruitMarySpin,
  getHotlineReelCount,
  getHotlineRowCount,
  hmacIntStream,
  hiloDraw,
  hiloMultiplier,
  hiloProbHigherOrEqual,
  hiloProbLowerOrEqual,
  hotlineEvaluate,
  hotlineSpin,
  hotlineSpinCascades,
  kenoDraw,
  kenoEvaluate,
  kenoMultiplier,
  minesMultiplier,
  minesPositions,
  plinkoMultiplier,
  plinkoPath,
  rouletteEvaluate,
  rouletteSpin,
  seth2Spin,
  sha256,
  TOWER_CONFIG,
  towerLayout,
  towerMultiplier,
  thor2Spin,
  wheelMultiplier,
  wheelSpin,
} from '@bg/provably-fair';
import {
  BACCARAT_TABLE_GAME_IDS,
  GameId,
  GAMES_REGISTRY,
  H5_GAMES,
  LOCAL_TABLE_GAME_IDS,
  SLOT_GAME_IDS,
} from '@bg/shared';

const prisma = new PrismaClient();
const amount = 100;
const password = 'ControlApiTest123!';
const runId = `ctrl_api_${new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, '')
  .slice(0, 17)}_${process.pid}`;
const clientSeed = `${runId}_client`;
const testSeedBase = `${runId}_server`;
const gameFilter = argCsv('--game');
const controlFilter = argCsv('--control');
const shardCount = argPositiveInt('--shard-count', 1);
const shardIndex = argPositiveInt('--shard-index', 0, true);

if (shardIndex >= shardCount) {
  throw new Error(`--shard-index must be between 0 and ${shardCount - 1}`);
}

const results = [];
let app;
let buildServer;
let adminToken;
let playerToken;
let adminAgent;
let lineAgent;
let player;
let localTableTestHooks;
let hotlineTestHooks;
let towerTestHooks;
let operationCounter = 0;
const verifiedControlToggleKeys = new Set();

const slotGameIds = [...SLOT_GAME_IDS];
const baccaratTableGameIds = [...BACCARAT_TABLE_GAME_IDS];
const localTableGameIds = [...LOCAL_TABLE_GAME_IDS];
const hotlineGameIds = [
  GameId.HOTLINE,
  GameId.FRUIT_SLOT,
  GameId.FORTUNE_SLOT,
  GameId.OCEAN_SLOT,
  GameId.TEMPLE_SLOT,
  GameId.CANDY_SLOT,
  GameId.SAKURA_SLOT,
  GameId.THUNDER_SLOT,
  GameId.DRAGON_MEGA_SLOT,
  GameId.NEBULA_SLOT,
  GameId.JUNGLE_SLOT,
  GameId.VAMPIRE_SLOT,
];
const crashGameIds = [
  GameId.ROCKET,
  GameId.AVIATOR,
  GameId.SPACE_FLEET,
  GameId.JETX,
  GameId.BALLOON,
  GameId.JETX3,
  GameId.DOUBLE_X,
];

const httpGames = [
  makeDiceGame(),
  makeKenoGame(),
  makeWheelGame(),
  makePlinkoGame(GameId.PLINKO),
  makePlinkoGame(GameId.PLINKO_X),
  makeRouletteGame(GameId.MINI_ROULETTE, '/api/games/mini-roulette/bet', 'mini roulette'),
  makeRouletteGame(GameId.CARNIVAL, '/api/games/carnival/bet', 'carnival roulette'),
  makeMinesGame(),
  makeHiloGame(),
  makeTowerGame(),
  makeChickenRoadGame(),
  makeBlackjackGame(),
  ...baccaratTableGameIds.map(makeBaccaratGame),
  ...hotlineGameIds.map(makeHotlineGame),
  makeSeth2Game(),
  makeThor2Game(),
  makeFruitMaryGame(),
  ...H5_GAMES.map(makeH5Game),
  ...localTableGameIds.map(makeLocalTableGame),
  ...crashGameIds.map(makeCrashGame),
];

const controlCases = [
  {
    key: 'win_loss_win',
    label: 'Win/Loss single-member force WIN',
    desired: 'WIN',
    raw: 'loss',
    expectedReasons: ['win_control'],
    supportsToggle: true,
    listUrl: '/api/admin/controls/win-loss',
    deleteUrl: (id) => `/api/admin/controls/win-loss/${id}`,
    toggleUrl: (id) => `/api/admin/controls/win-loss/${id}/toggle`,
    create: () =>
      adminPost('/api/admin/controls/win-loss', {
        controlMode: 'SINGLE_MEMBER',
        targetType: 'member',
        targetId: player.id,
        targetUsername: player.username,
        controlPercentage: '100',
        winControl: true,
        lossControl: false,
      }),
  },
  {
    key: 'win_loss_loss',
    label: 'Win/Loss single-member force LOSS',
    desired: 'LOSS',
    raw: 'win',
    expectedReasons: ['loss_control'],
    supportsToggle: true,
    listUrl: '/api/admin/controls/win-loss',
    deleteUrl: (id) => `/api/admin/controls/win-loss/${id}`,
    toggleUrl: (id) => `/api/admin/controls/win-loss/${id}/toggle`,
    create: () =>
      adminPost('/api/admin/controls/win-loss', {
        controlMode: 'SINGLE_MEMBER',
        targetType: 'member',
        targetId: player.id,
        targetUsername: player.username,
        controlPercentage: '100',
        winControl: false,
        lossControl: true,
      }),
  },
  {
    key: 'member_win_cap',
    label: 'Member win cap force LOSS',
    desired: 'LOSS',
    raw: 'win',
    expectedReasons: ['win_cap', 'win_cap_rate'],
    supportsToggle: true,
    listUrl: '/api/admin/controls/win-cap',
    deleteUrl: (id) => `/api/admin/controls/win-cap/${id}`,
    toggleUrl: (id) => `/api/admin/controls/win-cap/${id}/toggle`,
    create: () =>
      adminPost('/api/admin/controls/win-cap', {
        memberId: player.id,
        memberUsername: player.username,
        winCapAmount: '1',
        controlWinRate: '0',
        triggerThreshold: '0',
        notes: runId,
      }),
  },
  {
    key: 'agent_line_cap',
    label: 'Agent line cap force LOSS',
    desired: 'LOSS',
    raw: 'win',
    expectedReasons: ['agent_line_cap', 'agent_line_cap_rate'],
    supportsToggle: true,
    listUrl: '/api/admin/controls/agent-line',
    deleteUrl: (id) => `/api/admin/controls/agent-line/${id}`,
    toggleUrl: (id) => `/api/admin/controls/agent-line/${id}/toggle`,
    create: () =>
      adminPost('/api/admin/controls/agent-line', {
        agentId: lineAgent.id,
        agentUsername: lineAgent.username,
        dailyCap: '1',
        controlWinRate: '0',
        triggerThreshold: '0',
        notes: runId,
      }),
  },
  {
    key: 'deposit_win',
    label: 'Deposit control force WIN',
    desired: 'WIN',
    raw: 'loss',
    expectedReasons: ['deposit_control'],
    supportsToggle: true,
    listUrl: '/api/admin/controls/deposit',
    deleteUrl: (id) => `/api/admin/controls/deposit/${id}`,
    toggleUrl: (id) => `/api/admin/controls/deposit/${id}/toggle`,
    create: async () => {
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
      return adminPost('/api/admin/controls/deposit', {
        memberId: player.id,
        memberUsername: player.username,
        depositAmount: '1000',
        targetProfit: '999999999',
        startBalance: fresh.balance.toFixed(2),
        controlWinRate: '1',
        notes: runId,
      });
    },
  },
  {
    key: 'deposit_loss',
    label: 'Deposit control force LOSS',
    desired: 'LOSS',
    raw: 'win',
    expectedReasons: ['deposit_control'],
    supportsToggle: true,
    listUrl: '/api/admin/controls/deposit',
    deleteUrl: (id) => `/api/admin/controls/deposit/${id}`,
    toggleUrl: (id) => `/api/admin/controls/deposit/${id}/toggle`,
    create: async () => {
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
      return adminPost('/api/admin/controls/deposit', {
        memberId: player.id,
        memberUsername: player.username,
        depositAmount: '1000',
        targetProfit: '999999999',
        startBalance: fresh.balance.toFixed(2),
        controlWinRate: '0',
        notes: runId,
      });
    },
  },
  {
    key: 'deposit_path_down',
    label: 'Deposit lifecycle drives balance downward',
    desired: 'LOSS',
    raw: 'win',
    expectedReasons: ['deposit_control', 'deposit_lifecycle_path_guard'],
    supportsToggle: true,
    listUrl: '/api/admin/controls/deposit',
    deleteUrl: (id) => `/api/admin/controls/deposit/${id}`,
    toggleUrl: (id) => `/api/admin/controls/deposit/${id}/toggle`,
    create: async () => {
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
      return adminPost('/api/admin/controls/deposit', {
        memberId: player.id,
        memberUsername: player.username,
        startBalance: fresh.balance.toFixed(2),
        controlWinRate: '1',
        lifecycleSteps: [50],
        notes: `${runId}:path-down`,
      });
    },
  },
  {
    key: 'deposit_path_up',
    label: 'Deposit lifecycle drives balance upward',
    desired: 'WIN',
    raw: 'loss',
    expectedReasons: ['deposit_control', 'deposit_lifecycle_path_guard'],
    supportsToggle: true,
    listUrl: '/api/admin/controls/deposit',
    deleteUrl: (id) => `/api/admin/controls/deposit/${id}`,
    toggleUrl: (id) => `/api/admin/controls/deposit/${id}/toggle`,
    create: async () => {
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
      return adminPost('/api/admin/controls/deposit', {
        memberId: player.id,
        memberUsername: player.username,
        startBalance: fresh.balance.toFixed(2),
        controlWinRate: '1',
        lifecycleSteps: [150],
        notes: `${runId}:path-up`,
      });
    },
  },
  makeAutoBalanceControlCase({
    key: 'auto_balance_bite',
    label: 'Principal phase bites toward 30%',
    phase: 'BITE_TO_30',
    desired: 'LOSS',
    raw: 'win',
    reason: 'auto_balance_bite',
    baselineFactor: 1,
  }),
  makeAutoBalanceControlCase({
    key: 'auto_balance_revive',
    label: 'Principal phase revives toward 70%',
    phase: 'REVIVE_TO_70',
    desired: 'WIN',
    raw: 'loss',
    reason: 'auto_balance_revive',
    baselineFactor: 2,
  }),
  makeAutoBalanceControlCase({
    key: 'auto_balance_drain',
    label: 'Principal phase drains toward zero',
    phase: 'DRAIN_TO_ZERO',
    desired: 'LOSS',
    raw: 'win',
    reason: 'auto_balance_drain',
    baselineFactor: 1,
  }),
  {
    key: 'manual_detection_win',
    label: 'Manual detection force WIN',
    desired: 'WIN',
    raw: 'loss',
    expectedReasons: ['manual_detection'],
    supportsToggle: false,
    listUrl: '/api/admin/controls/manual-detection/status',
    deleteUrl: (id) => `/api/admin/controls/manual-detection/${id}`,
    create: () =>
      adminPost('/api/admin/controls/manual-detection/activate', {
        scope: 'MEMBER',
        controlMode: 'settlement',
        targetMemberUsername: player.username,
        targetSettlement: '-999999999',
        controlPercentage: 100,
      }),
  },
  {
    key: 'manual_detection_loss',
    label: 'Manual detection force LOSS',
    desired: 'LOSS',
    raw: 'win',
    expectedReasons: ['manual_detection'],
    supportsToggle: false,
    listUrl: '/api/admin/controls/manual-detection/status',
    deleteUrl: (id) => `/api/admin/controls/manual-detection/${id}`,
    create: () =>
      adminPost('/api/admin/controls/manual-detection/activate', {
        scope: 'MEMBER',
        controlMode: 'settlement',
        targetMemberUsername: player.username,
        targetSettlement: '999999999',
        controlPercentage: 100,
      }),
  },
  {
    key: 'burst_win',
    label: 'Burst control force WIN',
    desired: 'WIN',
    raw: 'loss',
    expectedReasons: ['burst_win', 'burst_small_win', 'burst_risk_cap'],
    appliesToGame: isBurstEligibleGame,
    acceptPlan: acceptsBurstWinPlan,
    supportsToggle: true,
    listUrl: '/api/admin/controls/burst',
    deleteUrl: (id) => `/api/admin/controls/burst/${id}`,
    toggleUrl: (id) => `/api/admin/controls/burst/${id}/toggle`,
    create: () =>
      adminPost(
        '/api/admin/controls/burst',
        burstBody({
          burstRate: '100',
          smallWinRate: '0',
          lossRate: '0',
        }),
      ),
  },
  {
    key: 'burst_loss',
    label: 'Burst control force LOSS',
    desired: 'LOSS',
    raw: 'win',
    expectedReasons: ['burst_loss', 'burst_budget_guard', 'burst_risk_guard'],
    appliesToGame: isBurstEligibleGame,
    acceptPlan: acceptsBurstLossPlan,
    supportsToggle: true,
    listUrl: '/api/admin/controls/burst',
    deleteUrl: (id) => `/api/admin/controls/burst/${id}`,
    toggleUrl: (id) => `/api/admin/controls/burst/${id}/toggle`,
    create: () =>
      adminPost(
        '/api/admin/controls/burst',
        burstBody({
          burstRate: '0',
          smallWinRate: '0',
          lossRate: '100',
          dailyBudget: '999999999',
          memberDailyCap: '999999999',
          maxBurstProfit: '999999999',
          singleMultiplierCap: '1000000',
        }),
      ),
  },
];

const cleanupPrefixIndex = process.argv.indexOf('--cleanup-prefix');
const cleanupOnlyPrefix = cleanupPrefixIndex >= 0 ? process.argv[cleanupPrefixIndex + 1] : null;

if (cleanupOnlyPrefix) {
  cleanup(cleanupOnlyPrefix)
    .then(async () => {
      await prisma.$disconnect();
      console.log(`[control-api] cleanup complete for ${cleanupOnlyPrefix}`);
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect().catch(() => undefined);
      process.exit(1);
    });
} else {
  main()
    .then(async () => {
      await shutdown(0);
    })
    .catch(async (error) => {
      console.error(error);
      await shutdown(1);
    });
}

async function main() {
  process.env.LOG_LEVEL = process.env.CONTROL_API_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'silent';
  process.env.CONTROL_API_FIXTURE_PREFIX = runId;
  ({ buildServer } = await import('../dist/server.js'));
  ({ __localTableServiceTestHooks: localTableTestHooks } =
    await import('../dist/modules/games/table-games/table-games.service.js'));
  ({ __hotlineServiceTestHooks: hotlineTestHooks } =
    await import('../dist/modules/games/hotline/hotline.service.js'));
  ({ __towerServiceTestHooks: towerTestHooks } =
    await import('../dist/modules/games/tower/tower.service.js'));
  console.log(`[control-api] runId=${runId}`);
  app = await buildServer();
  await cleanup(runId);
  await setupFixture();
  await login();
  await reportPotentialInterference();
  const games = selectedGames();
  assertEnabledGameCoverage();
  const controls = selectedControls();
  const cases = selectedControlGameCases(games, controls);
  console.log(
    `[control-api] games=${games.length} controls=${controls.length} cases=${cases.length}`,
  );
  await precomputePlans(cases);

  let done = 0;
  const total = cases.length;
  for (const { game, control } of cases) {
    done += 1;
    process.stdout.write(`[${done}/${total}] ${game.id} :: ${control.key} ... `);
    const result = await runControlGameCase(control, game);
    results.push(result);
    console.log(result.ok ? `PASS ${result.note ?? ''}` : `FAIL ${result.error}`);
  }

  printSummary();
  if (results.some((result) => !result.ok)) {
    throw new Error('control API matrix contains failed cases');
  }
}

async function shutdown(code) {
  try {
    if (app) await app.close();
  } catch {
    // ignore
  }
  try {
    await cleanup(runId);
  } catch (error) {
    console.error('[control-api] cleanup failed:', error);
    code = code || 1;
  }
  await prisma.$disconnect().catch(() => undefined);
  if (process.env.CONTROL_API_FIXTURE_PREFIX === runId) {
    delete process.env.CONTROL_API_FIXTURE_PREFIX;
  }
  process.exit(code);
}

function argCsv(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) return null;
  return new Set(
    process.argv[index + 1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function argPositiveInt(name, fallback, allowZero = false) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) return fallback;
  const value = Number.parseInt(process.argv[index + 1], 10);
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`);
  }
  return value;
}

function selectedGames() {
  const filtered = gameFilter ? httpGames.filter((game) => gameFilter.has(game.id)) : httpGames;
  return filtered.filter((_, index) => index % shardCount === shardIndex);
}

function selectedControls() {
  return controlFilter
    ? controlCases.filter((control) => controlFilter.has(control.key))
    : controlCases;
}

function selectedControlGameCases(games, controls) {
  const cases = [];
  for (const game of games) {
    for (const control of controls) {
      if (control.appliesToGame && !control.appliesToGame(game)) continue;
      cases.push({ game, control });
    }
  }
  return cases;
}

function isBurstEligibleGame(game) {
  return slotGameIds.includes(game.id);
}

function acceptsBurstLossPlan(plan) {
  const multiplier = Number(plan.multiplier);
  const payout = Number(plan.payout);
  return (
    Number.isFinite(multiplier) &&
    Number.isFinite(payout) &&
    multiplier > 1 &&
    multiplier <= 3 &&
    payout <= amount * 3 &&
    plan.controlSafeLoss !== false
  );
}

function acceptsBurstWinPlan(plan) {
  return plan.controlSafeWin !== false;
}

async function setupFixture() {
  const hash = await bcrypt.hash(password, 10);
  adminAgent = await prisma.agent.create({
    data: {
      username: `${runId}_sa`,
      passwordHash: hash,
      displayName: 'Control API Super Admin',
      level: 0,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      marketType: 'D',
      balance: new Prisma.Decimal('100000000'),
      commissionRate: new Prisma.Decimal('0'),
      rebateMode: 'PERCENTAGE',
      rebatePercentage: new Prisma.Decimal('0.025'),
      maxRebatePercentage: new Prisma.Decimal('0.025'),
      baccaratRebateMode: 'PERCENTAGE',
      baccaratRebatePercentage: new Prisma.Decimal('0.010'),
      maxBaccaratRebatePercentage: new Prisma.Decimal('0.010'),
      bettingLimitLevel: 'level3',
      notes: runId,
    },
  });

  lineAgent = await prisma.agent.create({
    data: {
      username: `${runId}_agent`,
      passwordHash: hash,
      displayName: 'Control API Agent',
      parentId: adminAgent.id,
      level: 1,
      role: 'AGENT',
      status: 'ACTIVE',
      marketType: 'D',
      balance: new Prisma.Decimal('100000000'),
      commissionRate: new Prisma.Decimal('0'),
      rebateMode: 'PERCENTAGE',
      rebatePercentage: new Prisma.Decimal('0.025'),
      maxRebatePercentage: new Prisma.Decimal('0.025'),
      baccaratRebateMode: 'PERCENTAGE',
      baccaratRebatePercentage: new Prisma.Decimal('0.010'),
      maxBaccaratRebatePercentage: new Prisma.Decimal('0.010'),
      bettingLimitLevel: 'level3',
      notes: runId,
    },
  });

  player = await prisma.user.create({
    data: {
      username: `${runId}_member`,
      passwordHash: hash,
      displayName: 'Control API Member',
      role: 'PLAYER',
      agentId: lineAgent.id,
      balance: new Prisma.Decimal('10000000'),
      marketType: 'D',
      bettingLimitLevel: 'level3',
      notes: runId,
    },
  });

  await prisma.clientSeed.create({
    data: { userId: player.id, seed: clientSeed, isActive: true },
  });
}

async function login() {
  await loginAdmin();
  await loginPlayer();
}

async function loginAdmin() {
  const captcha = await request('GET', '/api/admin/auth/captcha');
  const adminLogin = await request('POST', '/api/admin/auth/login', null, {
    username: adminAgent.username,
    password,
    captchaCode: captcha.body.captchaCode,
    captchaToken: captcha.body.captchaToken,
  });
  adminToken = adminLogin.body.accessToken;
}

async function loginPlayer() {
  const captcha = await request('GET', '/api/auth/captcha');
  const userLogin = await request('POST', '/api/auth/login', null, {
    username: player.username,
    password,
    captchaCode: captcha.body.captchaCode,
    captchaToken: captcha.body.captchaToken,
  });
  playerToken = userLogin.body.accessToken;
}

async function precomputePlans(cases) {
  const cache = new Map();
  for (const { game, control } of cases) {
    game.plans ??= {};
    const acceptPlan =
      control.acceptPlan ??
      (control.desired === 'WIN' ? acceptsControlSafeWinPlan : acceptsControlSafeLossPlan);
    const cacheKey = `${game.id}:${control.raw}:${acceptPlan.name}`;
    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, findPlan(game, control.raw, acceptPlan));
    }
    game.plans[control.key] = cache.get(cacheKey);
  }
}

function acceptsControlSafeWinPlan(plan) {
  return plan.controlSafeWin !== false;
}

function acceptsControlSafeLossPlan(plan) {
  return plan.controlSafeLoss !== false;
}

function assertEnabledGameCoverage() {
  const tested = new Set(httpGames.map((game) => game.id));
  const missing = Object.values(GAMES_REGISTRY)
    .filter((game) => game.enabled && !tested.has(game.id))
    .map((game) => game.id);
  if (missing.length) {
    throw new Error(`enabled games missing from API matrix: ${missing.join(', ')}`);
  }
}

async function runControlGameCase(control, game) {
  let created;
  try {
    await resetFixtureFinancialState();
    created = await control.create();
    const controlId = created.body.id;
    if (control.listUrl) await assertListed(control, controlId);

    if (control.supportsToggle && !verifiedControlToggleKeys.has(control.key)) {
      await adminPatch(control.toggleUrl(controlId), { isActive: false });
      await adminPatch(control.toggleUrl(controlId), { isActive: true });
      verifiedControlToggleKeys.add(control.key);
    }

    const plan = game.plans[control.key];
    await prepareSeed(game.seedCategory, plan.seed, plan.nonce);
    const balanceBefore = await playerBalance();
    const run = await game.run(plan, control);
    const settlement = await assertFinancialSettlement(game, run, balanceBefore);
    const log = await latestControlLog(controlId, game.id);

    if (!log) {
      throw new Error(`no WinLossControlLogs row for ${controlId}; effect=${settlement.effect}`);
    }
    if (!control.expectedReasons.includes(log.flipReason)) {
      throw new Error(
        `unexpected flipReason ${log.flipReason}, expected one of ${control.expectedReasons.join(', ')}`,
      );
    }
    const finalWon = Boolean(log.finalResult?.won);
    if (control.desired === 'WIN' && !finalWon) {
      throw new Error(`final result was not WIN: ${JSON.stringify(log.finalResult)}`);
    }
    if (control.desired === 'LOSS' && finalWon) {
      throw new Error(`final result was not LOSS: ${JSON.stringify(log.finalResult)}`);
    }

    return {
      ok: true,
      gameId: game.id,
      control: control.key,
      note: `log=${log.flipReason} balance=${settlement.balanceDelta}`,
    };
  } catch (error) {
    return {
      ok: false,
      gameId: game.id,
      control: control.key,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (created?.body?.id) {
      await deleteControl(control, created.body.id).catch(() => undefined);
    }
    await resetOpenRounds().catch(() => undefined);
  }
}

async function assertListed(control, id) {
  const listed = await adminGet(control.listUrl);
  const items = listed.body.items ?? listed.body.activeControls ?? [];
  if (!items.some((item) => item.id === id)) {
    throw new Error(`control ${id} was not returned by ${control.listUrl}`);
  }
}

async function deleteControl(control, id) {
  if (control.cleanup) {
    await control.cleanup(id);
    return;
  }
  if (control.key.startsWith('manual_detection')) {
    await adminPost('/api/admin/controls/manual-detection/deactivate', { id }).catch(
      () => undefined,
    );
  }
  await adminDelete(control.deleteUrl(id));
}

function makeAutoBalanceControlCase({ key, label, phase, desired, raw, reason, baselineFactor }) {
  return {
    key,
    label,
    phase,
    desired,
    raw,
    expectedReasons: [reason, 'auto_balance_path_guard'],
    supportsToggle: false,
    create: async () => {
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
      const baseline = fresh.balance.mul(baselineFactor).toDecimalPlaces(2);
      const control = await prisma.memberAutoBalanceControl.upsert({
        where: { memberId: player.id },
        create: {
          memberId: player.id,
          memberUsername: player.username,
          agentId: player.agentId,
          baselineBalance: baseline,
          biteTargetBalance: baseline.mul('0.30').toDecimalPlaces(2),
          reviveTargetBalance: baseline.mul('0.70').toDecimalPlaces(2),
          phase,
          controlPercentage: 100,
          isActive: true,
          operatorUsername: adminAgent.username,
        },
        update: {
          baselineBalance: baseline,
          biteTargetBalance: baseline.mul('0.30').toDecimalPlaces(2),
          reviveTargetBalance: baseline.mul('0.70').toDecimalPlaces(2),
          phase,
          lifecycleSteps: Prisma.DbNull,
          currentStageIndex: 0,
          lifecycleCompletedAt: null,
          controlPercentage: 100,
          isActive: true,
          operatorUsername: adminAgent.username,
        },
      });
      return { body: { id: control.id } };
    },
    cleanup: (id) => prisma.memberAutoBalanceControl.deleteMany({ where: { id } }),
  };
}

async function playerBalance() {
  const current = await prisma.user.findUniqueOrThrow({
    where: { id: player.id },
    select: { balance: true },
  });
  return current.balance;
}

async function assertFinancialSettlement(game, run, balanceBefore) {
  const balanceAfter = await playerBalance();
  if (run.accounting === 'crash') {
    const bet = run.crashBetId
      ? await prisma.crashBet.findUnique({ where: { id: run.crashBetId } })
      : await prisma.crashBet.findFirst({
          where: { userId: player.id, round: { gameId: game.id } },
          orderBy: { createdAt: 'desc' },
        });
    if (!bet || !bet.controlFinalizedAt) throw new Error('crash bet was not finalized');
    const expected = balanceBefore.minus(bet.amount).plus(bet.payout);
    assertDecimalClose(balanceAfter, expected, 'crash wallet balance');
    return {
      effect: bet.payout.greaterThan(bet.amount) ? 'WIN' : 'LOSS',
      balanceDelta: balanceAfter.minus(balanceBefore).toFixed(2),
    };
  }

  const bet = run.betId
    ? await prisma.bet.findUnique({ where: { id: run.betId } })
    : await latestBet(game.id);
  if (!bet || bet.status !== 'SETTLED') {
    throw new Error(`bet did not settle; status=${bet?.status ?? 'missing'}`);
  }
  assertDecimalClose(bet.profit, bet.payout.minus(bet.amount), 'bet profit');
  assertDecimalClose(bet.payout, bet.amount.mul(bet.multiplier), 'bet payout/multiplier');
  const expected = balanceBefore.minus(bet.amount).plus(bet.payout);
  assertDecimalClose(balanceAfter, expected, 'wallet balance');
  return {
    effect: bet.payout.greaterThan(bet.amount) ? 'WIN' : 'LOSS',
    balanceDelta: balanceAfter.minus(balanceBefore).toFixed(2),
  };
}

function assertDecimalClose(actual, expected, label) {
  if (new Prisma.Decimal(actual).minus(expected).abs().greaterThan('0.011')) {
    throw new Error(
      `${label} mismatch: actual=${actual.toString()} expected=${expected.toString()}`,
    );
  }
}

async function latestControlLog(controlId, gameId) {
  return prisma.winLossControlLogs.findFirst({
    where: {
      controlId,
      userId: player.id,
      gameId,
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function prepareSeed(gameCategory, seed, nonce) {
  await prisma.$transaction(async (tx) => {
    await tx.serverSeed.updateMany({
      where: { userId: player.id, gameCategory, isActive: true },
      data: { isActive: false },
    });
    await tx.serverSeed.create({
      data: {
        userId: player.id,
        gameCategory,
        seed,
        seedHash: sha256(seed),
        isActive: true,
        nonce: nonce - 1,
      },
    });
    await tx.clientSeed.updateMany({
      where: { userId: player.id, isActive: true },
      data: { isActive: false },
    });
    await tx.clientSeed.create({
      data: { userId: player.id, seed: clientSeed, isActive: true },
    });
  });
}

async function resetOpenRounds() {
  await prisma.minesRound.updateMany({
    where: { userId: player.id, status: 'ACTIVE' },
    data: { status: 'BUSTED', finishedAt: new Date() },
  });
  await prisma.hiLoRound.updateMany({
    where: { userId: player.id, status: 'ACTIVE' },
    data: { status: 'BUSTED', finishedAt: new Date() },
  });
  await prisma.towerRound.updateMany({
    where: { userId: player.id, status: 'ACTIVE' },
    data: { status: 'BUSTED', finishedAt: new Date() },
  });
  await prisma.blackjackRound.updateMany({
    where: { userId: player.id, status: 'ACTIVE' },
    data: { status: 'BUSTED', finishedAt: new Date() },
  });
  await prisma.bet.updateMany({
    where: { userId: player.id, status: 'PENDING' },
    data: { status: 'VOID', settledAt: new Date() },
  });
  const runningCrashRounds = await prisma.crashRound.findMany({
    where: { status: 'RUNNING', bets: { some: { userId: player.id } } },
    select: { id: true },
  });
  if (runningCrashRounds.length) {
    await prisma.crashRound.updateMany({
      where: { id: { in: runningCrashRounds.map((round) => round.id) } },
      data: { status: 'CRASHED', crashedAt: new Date() },
    });
  }
}

async function resetFixtureFinancialState() {
  await resetOpenRounds();
  const crashRounds = await prisma.crashBet.findMany({
    where: { userId: player.id },
    select: { roundId: true },
  });
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { userId: player.id } }),
    prisma.crashBet.deleteMany({ where: { userId: player.id } }),
    ...(crashRounds.length
      ? [
          prisma.crashRound.deleteMany({
            where: { id: { in: crashRounds.map((round) => round.roundId) } },
          }),
        ]
      : []),
    prisma.bet.deleteMany({ where: { userId: player.id } }),
    prisma.minesRound.deleteMany({ where: { userId: player.id } }),
    prisma.hiLoRound.deleteMany({ where: { userId: player.id } }),
    prisma.towerRound.deleteMany({ where: { userId: player.id } }),
    prisma.blackjackRound.deleteMany({ where: { userId: player.id } }),
    prisma.winLossControlLogs.deleteMany({ where: { userId: player.id } }),
    prisma.user.update({
      where: { id: player.id },
      data: { balance: new Prisma.Decimal('10000000') },
    }),
  ]);
}

function findPlan(game, raw, acceptPlan) {
  const wantWin = raw === 'win';
  const seed = `${testSeedBase}:${game.id}:plan:${raw}`;
  for (let nonce = 1; nonce <= (game.maxSearch ?? 50000); nonce += 1) {
    const plan = game.plan(seed, clientSeed, nonce, raw);
    if (plan.valid !== false && plan.rawWin === wantWin && (!acceptPlan || acceptPlan(plan)))
      return { ...plan, nonce, seed };
  }
  throw new Error(`cannot find raw ${raw} plan for ${game.id}`);
}

function makeDiceGame() {
  const payload = { amount, target: 50, direction: 'under', clientSeed };
  return {
    id: GameId.DICE,
    seedCategory: 'dice',
    maxSearch: 500,
    plan: (seed, c, nonce) => {
      const outcome = diceDetermine(seed, c, nonce, payload.target, payload.direction);
      const multiplier = diceMultiplier(outcome.winChance);
      const payout = outcome.won ? multiplier * amount : 0;
      return {
        rawWin: outcome.won && payout > amount,
        multiplier,
        payout,
        payload,
      };
    },
    run: async (plan) => {
      const res = await playerPost('/api/games/dice/bet', plan.payload);
      return { effect: Number(res.body.payout) > amount ? 'WIN' : 'LOSS', body: res.body };
    },
  };
}

function makeKenoGame() {
  const payload = {
    amount,
    selected: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    risk: 'low',
    clientSeed,
  };
  return {
    id: GameId.KENO,
    seedCategory: 'keno',
    maxSearch: 5000,
    plan: (seed, c, nonce) => {
      const drawn = kenoDraw(seed, c, nonce);
      const { hits } = kenoEvaluate(drawn, payload.selected);
      const multiplier = kenoMultiplier(payload.risk, payload.selected.length, hits.length);
      const payout = multiplier * amount;
      return { rawWin: payout > amount, multiplier, payout, payload };
    },
    run: async (plan) => {
      const res = await playerPost('/api/games/keno/bet', plan.payload);
      return { effect: Number(res.body.payout) > amount ? 'WIN' : 'LOSS', body: res.body };
    },
  };
}

function makeWheelGame() {
  const payload = { amount, risk: 'medium', segments: 10, clientSeed };
  return {
    id: GameId.WHEEL,
    seedCategory: 'wheel',
    maxSearch: 2000,
    plan: (seed, c, nonce) => {
      const spin = wheelSpin(seed, c, nonce, payload.segments);
      const multiplier = wheelMultiplier(payload.risk, payload.segments, spin.segmentIndex);
      const payout = multiplier * amount;
      return { rawWin: payout > amount, multiplier, payout, payload };
    },
    run: async (plan) => {
      const res = await playerPost('/api/games/wheel/bet', plan.payload);
      return { effect: Number(res.body.payout) > amount ? 'WIN' : 'LOSS', body: res.body };
    },
  };
}

function makePlinkoGame(id) {
  const payload = { gameId: id, amount, rows: 10, risk: 'medium', clientSeed };
  return {
    id,
    seedCategory: id,
    maxSearch: 10000,
    plan: (seed, c, nonce) => {
      const path = plinkoPath(seed, c, nonce, payload.rows);
      const multiplier = plinkoMultiplier(payload.risk, payload.rows, path.bucket);
      const payout = multiplier * amount;
      return { rawWin: payout > amount, multiplier, payout, payload };
    },
    run: async (plan) => {
      const res = await playerPost('/api/games/plinko/bet', plan.payload);
      return { effect: Number(res.body.payout) > amount ? 'WIN' : 'LOSS', body: res.body };
    },
  };
}

function makeRouletteGame(id, url, name) {
  const payload = { bets: [{ type: 'red', amount }], clientSeed };
  return {
    id,
    name,
    seedCategory: 'roulette',
    maxSearch: 500,
    plan: (seed, c, nonce) => {
      const { slot } = rouletteSpin(seed, c, nonce);
      const evaluated = rouletteEvaluate(slot, payload.bets);
      const multiplier = evaluated.totalPayout / amount;
      return {
        rawWin: evaluated.totalPayout > amount,
        multiplier,
        payout: evaluated.totalPayout,
        payload,
      };
    },
    run: async (plan) => {
      const res = await playerPost(url, plan.payload);
      return { effect: Number(res.body.totalPayout) > amount ? 'WIN' : 'LOSS', body: res.body };
    },
  };
}

function makeHotlineGame(id) {
  const payload = { amount, gameId: id, clientSeed };
  return {
    id,
    seedCategory: id,
    maxSearch: 100000,
    plan: (seed, c, nonce) => {
      const reelCount = getHotlineReelCount(id);
      const rowCount = getHotlineRowCount(id);
      const round =
        rowCount > 3
          ? hotlineSpinCascades(seed, c, nonce, reelCount, rowCount)
          : {
              totalMultiplier: hotlineEvaluate(hotlineSpin(seed, c, nonce, reelCount, rowCount))
                .totalMultiplier,
            };
      const payout = round.totalMultiplier * amount;
      return { rawWin: payout > amount, multiplier: round.totalMultiplier, payout, payload };
    },
    run: async (plan) => {
      const res = await playerPost('/api/games/hotline/bet', plan.payload);
      return { effect: Number(res.body.payout) > amount ? 'WIN' : 'LOSS', body: res.body };
    },
  };
}

function makeSeth2Game() {
  const payload = {
    event: 'spin',
    data: {
      action: 'spin',
      stakeValue: 5,
      ratioValue: 1,
      machineId: 1,
    },
  };
  return {
    id: GameId.STORM_OF_SETH_2,
    seedCategory: GameId.STORM_OF_SETH_2,
    maxSearch: 5000,
    plan: (seed, c, nonce) => {
      const outcome = seth2Spin(seed, c, nonce, amount);
      const payout = outcome.payoutFactor * amount;
      return {
        rawWin: payout > amount,
        multiplier: outcome.payoutFactor,
        payout,
        payload,
      };
    },
    run: async (plan) => {
      const res = await playerPost('/api/games/seth2/source', {
        ...plan.payload,
        data: { ...plan.payload.data, operationId: nextOperationId('seth2') },
      });
      const betId = res.body?.engine?.spinId;
      if (!betId) throw new Error('Seth 2 spin did not return a bet id');
      const sequence = await prisma.seth2FeatureSequence.findUnique({ where: { betId } });
      if (sequence?.status === 'READY') {
        await playerPost('/api/games/seth2/source', {
          event: 'closeSpin',
          data: { spinId: betId },
        });
      }
      return { betId, body: res.body };
    },
  };
}

function makeThor2Game() {
  return {
    id: GameId.POWER_OF_THOR_2,
    seedCategory: GameId.POWER_OF_THOR_2,
    maxSearch: 10000,
    plan: (seed, c, nonce) => {
      const outcome = thor2Spin(seed, c, nonce);
      const payout = outcome.totalMultiplier * amount;
      return {
        rawWin: payout > amount,
        multiplier: outcome.totalMultiplier,
        payout,
      };
    },
    run: async () => {
      const res = await playerPost('/api/games/thor2/spin', {
        action: 'spin',
        amount,
        operationId: nextOperationId('thor2'),
        clientSeed,
      });
      if (res.body.payoutDeferred) {
        await playerPost('/api/games/thor2/feature/complete', { betId: res.body.betId });
      }
      return { betId: res.body.betId, body: res.body };
    },
  };
}

function makeFruitMaryGame() {
  const selections = [{ fruitId: 5, units: 10 }];
  const payload = { fruits: [[5, 10]], money: 10 };
  return {
    id: GameId.FRUIT_MARY,
    seedCategory: GameId.FRUIT_MARY,
    maxSearch: 10000,
    plan: (seed, c, nonce) => {
      const outcome = fruitMarySpin(seed, c, nonce, selections);
      const payout = outcome.totalPayoutUnits * 10;
      return {
        rawWin: payout > amount,
        multiplier: payout / amount,
        payout,
        payload,
      };
    },
    run: async (plan) => {
      const res = await playerPost('/api/games/fruit-mary/spin', plan.payload);
      return { betId: res.body.spinId, body: res.body };
    },
  };
}

function makeH5Game(game) {
  const payload = { gameCode: game.code, amount, clientSeed };
  return {
    id: game.gameId,
    seedCategory: game.gameId,
    maxSearch: 100000,
    plan: (seed, c, nonce) => {
      const reelCount = getHotlineReelCount(game.gameId);
      const rowCount = getHotlineRowCount(game.gameId);
      const round = hotlineTestHooks?.buildHotlineRound(
        seed,
        c,
        nonce,
        game.gameId,
        reelCount,
        rowCount,
        false,
        undefined,
        undefined,
      );
      if (!round) {
        return { valid: false, rawWin: false, multiplier: 0, payout: 0, payload };
      }
      const payout = round.totalMultiplier * amount;
      const scatterCount = Number(round.features?.scatterCount ?? 0);
      const selectionDeferred =
        ((game.code === '281' || game.code === '232') && scatterCount >= 3) ||
        (game.code === '278' && scatterCount >= 4);
      const visualDeferred =
        (game.code === '278' || game.code === '321') &&
        Boolean(round.features?.freeSpinRounds?.length);
      return {
        valid: !selectionDeferred && !visualDeferred,
        rawWin: payout > amount,
        multiplier: round.totalMultiplier,
        payout,
        payload,
      };
    },
    run: async (plan) => {
      let res = await playerPost('/api/games/h5-slots/spin', plan.payload);
      const betId = res.body.betId;
      if (!betId) throw new Error(`${game.gameId} spin did not return a bet id`);
      const current = await prisma.bet.findUnique({ where: { id: betId } });
      if (current?.status === 'PENDING' && (game.code === '281' || game.code === '232')) {
        res = await playerPost('/api/games/h5-slots/select-free-mode', {
          gameCode: game.code,
          betId,
          type: 1,
        });
      } else if (current?.status === 'PENDING' && game.code === '278') {
        res = await playerPost('/api/games/h5-slots/caishen/collect-free', {
          gameCode: game.code,
          betId,
        });
      }
      if (res.body.payoutDeferred) {
        await playerPost('/api/games/h5-slots/complete-feature', {
          gameCode: game.code,
          betId,
        });
      }
      return { betId, body: res.body };
    },
  };
}

function makeLocalTableGame(id) {
  const payload = { gameId: id, amount, clientSeed };
  const kind = localTableKind(id);
  return {
    id,
    seedCategory: `table:${kind}`,
    maxSearch: 10000,
    plan: (seed, c, nonce) => {
      if (!localTableTestHooks) {
        return { valid: false, rawWin: false, multiplier: 0, payout: 0, payload };
      }
      const seedBundle = { serverSeed: seed, clientSeed: c, nonce };
      let splitId;
      let round;
      if (kind === 'black-dot') {
        const deck = localTableTestHooks.drawControlFlexibleBlackDotDeck(id, seedBundle);
        const playerTiles = deck.slice(0, 4);
        splitId = localTableTestHooks.buildBlackDotSplitOptions(playerTiles)[0]?.id;
        if (!splitId) {
          return { valid: false, rawWin: false, multiplier: 0, payout: 0, payload };
        }
        round = localTableTestHooks.buildBlackDotRoundFromSplitForGame(
          id,
          new Prisma.Decimal(amount),
          playerTiles,
          deck.slice(4, 8),
          splitId,
        );
      } else {
        round =
          kind === 'twenty-one-half'
            ? localTableTestHooks.buildTwentyOneHalfAutoplayRound(
                id,
                new Prisma.Decimal(amount),
                seedBundle,
              )
            : localTableTestHooks.buildRound(id, new Prisma.Decimal(amount), seedBundle, 0);
      }
      return {
        rawWin: round.profit.greaterThan(0),
        multiplier: Number(round.multiplier),
        payout: Number(round.payout),
        payload,
        splitId,
        controlSafeWin:
          kind !== 'twenty-one-half' ||
          localTableTestHooks
            .buildTwentyOneHalfControlledAutoplayRound(
              id,
              new Prisma.Decimal(amount),
              seedBundle,
              true,
            )
            .profit.greaterThan(0),
        controlSafeLoss:
          kind !== 'twenty-one-half' ||
          !localTableTestHooks
            .buildTwentyOneHalfControlledAutoplayRound(
              id,
              new Prisma.Decimal(amount),
              seedBundle,
              false,
            )
            .profit.greaterThan(0),
      };
    },
    run: async (plan) => {
      if (kind === 'twenty-one-half') {
        let state = (await playerPost('/api/games/table-games/twenty-one-half/start', plan.payload))
          .body;
        for (let step = 0; state.status === 'ACTIVE' && step < 20; step += 1) {
          if (state.phase === 'BANKER_TURN') {
            state = (
              await playerPost('/api/games/table-games/twenty-one-half/banker-draw', {
                roundId: state.roundId,
              })
            ).body;
          } else if (
            state.canHit &&
            (state.forcedAction === 'hit' || Number.parseFloat(state.player.scoreLabel) < 7)
          ) {
            state = (
              await playerPost('/api/games/table-games/twenty-one-half/hit', {
                roundId: state.roundId,
              })
            ).body;
          } else {
            state = (
              await playerPost('/api/games/table-games/twenty-one-half/stand', {
                roundId: state.roundId,
              })
            ).body;
          }
        }
        if (state.status !== 'SETTLED') throw new Error(`${id} did not settle after 20 actions`);
        return { betId: state.roundId, body: state };
      }

      let state = (await playerPost('/api/games/table-games/round/start', plan.payload)).body;
      for (let step = 0; state.status === 'ACTIVE' && step < 10; step += 1) {
        if (state.canSplit) {
          const splitId = plan.splitId ?? state.splitOptions?.[0]?.id;
          if (!splitId) throw new Error(`${id} requested a split without options`);
          state = (
            await playerPost('/api/games/table-games/round/split', {
              roundId: state.roundId,
              splitId,
            })
          ).body;
        } else {
          state = (
            await playerPost('/api/games/table-games/round/reveal', {
              roundId: state.roundId,
              ...(state.revealablePlayerIndexes?.length
                ? { revealIndex: state.revealablePlayerIndexes[0] }
                : {}),
            })
          ).body;
        }
      }
      if (state.status !== 'SETTLED') throw new Error(`${id} did not settle after 10 actions`);
      return { betId: state.roundId, body: state };
    },
  };
}

function makeCrashGame(id) {
  return {
    id,
    seedCategory: `crash:${id}`,
    maxSearch: 1,
    plan: (_seed, _c, _nonce, raw) => ({
      rawWin: raw === 'win',
      multiplier: raw === 'win' ? 2 : 0,
      payout: raw === 'win' ? amount * 2 : 0,
    }),
    run: async (plan) => {
      const lastRound = await prisma.crashRound.findFirst({
        where: { gameId: id },
        orderBy: { roundNumber: 'desc' },
        select: { roundNumber: true },
      });
      const nextRoundNumber = (lastRound?.roundNumber ?? 0) + 1;
      let selectedSeed = plan.seed;
      for (let variant = 0; variant < 10000; variant += 1) {
        const candidate = `${plan.seed}:crash:${variant}`;
        const point = crashPoint(candidate, `${id}:${nextRoundNumber}`);
        const matches = plan.rawWin ? point > 1.01 : point < 1000;
        if (matches) {
          selectedSeed = candidate;
          break;
        }
      }
      await prisma.serverSeed.updateMany({
        where: { userId: player.id, gameCategory: `crash:${id}`, isActive: true },
        data: { seed: selectedSeed, seedHash: sha256(selectedSeed) },
      });
      const start = await playerPost('/api/games/crash/bet', {
        gameId: id,
        amount,
        autoCashOut: plan.rawWin ? 1.01 : 1000,
        clientSeed,
      });
      let state = start.body;
      if (start.body.status === 'RUNNING') {
        await prisma.crashRound.update({
          where: { id: start.body.roundId },
          data: { startedAt: new Date(Date.now() - 1000) },
        });
        state = (await playerGet(`/api/games/crash/round/${start.body.roundId}`)).body;
        if (state.status === 'RUNNING') {
          await playerPost('/api/games/crash/cashout', { roundId: start.body.roundId });
        }
      }
      return {
        accounting: 'crash',
        crashBetId: start.body.betId,
        body: start.body,
      };
    },
  };
}

function localTableKind(id) {
  if (id.startsWith('twenty-one-half-')) return 'twenty-one-half';
  if (id.startsWith('tui-tongzi-')) return 'tui-tongzi';
  if (id.startsWith('black-dot-')) return 'black-dot';
  return 'card-war';
}

function nextOperationId(prefix) {
  operationCounter += 1;
  return `${runId}_${prefix}_${operationCounter}`;
}

function makeMinesGame() {
  const startPayload = { amount, mineCount: 3, clientSeed };
  return {
    id: GameId.MINES,
    seedCategory: 'mines',
    winCanRemainPending: true,
    maxSearch: 500,
    plan: (seed, c, nonce, raw) => {
      const positions = minesPositions(seed, c, nonce, startPayload.mineCount);
      const winCells = Array.from({ length: 25 }, (_, index) => index)
        .filter((index) => !positions.includes(index))
        .slice(0, 6);
      const winCell = winCells[0];
      const lossCell = positions[0];
      const multiplier = minesMultiplier(startPayload.mineCount, 1);
      return {
        rawWin: raw === 'win',
        multiplier,
        payout: multiplier * amount,
        startPayload,
        winAction: { cellIndex: winCell },
        winActions: winCells.map((cellIndex) => ({ cellIndex })),
        lossAction: { cellIndex: lossCell },
        winPays: multiplier * amount > amount,
      };
    },
    run: async (plan, control) => {
      const start = await playerPost('/api/games/mines/start', plan.startPayload);
      const actions =
        control.desired === 'LOSS' && plan.rawWin
          ? plan.winActions
          : [plan.rawWin ? plan.winAction : plan.lossAction];
      let reveal;
      for (const action of actions) {
        reveal = await playerPost('/api/games/mines/reveal', {
          roundId: start.body.roundId,
          cellIndex: action.cellIndex,
        });
        if (reveal.body.hitMine) break;
      }
      if (!reveal?.body.hitMine) {
        await playerPost('/api/games/mines/cashout', { roundId: start.body.roundId });
      }
      return { body: reveal?.body ?? start.body };
    },
  };
}

function makeHiloGame() {
  const startPayload = { amount, clientSeed };
  return {
    id: GameId.HILO,
    seedCategory: 'hilo',
    winCanRemainPending: true,
    maxSearch: 2000,
    plan: (seed, c, nonce, raw) => {
      if (raw === 'win') {
        const guessActions = [];
        let current = hiloDraw(seed, c, nonce, 0);
        let multiplier = 1;
        for (let index = 1; index <= 6; index += 1) {
          const next = hiloDraw(seed, c, nonce, index);
          const guess = next.rank >= current.rank ? 'higher' : 'lower';
          const chance =
            guess === 'higher'
              ? hiloProbHigherOrEqual(current.rank)
              : hiloProbLowerOrEqual(current.rank);
          multiplier *= hiloMultiplier(chance);
          guessActions.push({ guess });
          current = next;
        }
        return {
          rawWin: multiplier * amount > amount,
          multiplier,
          payout: multiplier * amount,
          startPayload,
          guessPayload: guessActions[0],
          guessActions,
        };
      } else {
        const current = hiloDraw(seed, c, nonce, 0);
        const next = hiloDraw(seed, c, nonce, 1);
        for (const guess of ['higher', 'lower']) {
          const rawCorrect =
            guess === 'higher' ? next.rank >= current.rank : next.rank <= current.rank;
          const chance =
            guess === 'higher'
              ? hiloProbHigherOrEqual(current.rank)
              : hiloProbLowerOrEqual(current.rank);
          const multiplier = hiloMultiplier(chance);
          if (!rawCorrect) {
            return {
              rawWin: false,
              multiplier,
              payout: multiplier * amount,
              controlSafeWin:
                multiplier > 1 && multiplier <= 3 && multiplier * amount <= amount + 20,
              startPayload,
              guessPayload: { guess },
            };
          }
        }
      }
      return {
        rawWin: raw === 'win' ? false : true,
        multiplier: 0,
        payout: 0,
        startPayload,
        guessPayload: { guess: 'higher' },
      };
    },
    run: async (plan, control) => {
      const start = await playerPost('/api/games/hilo/start', plan.startPayload);
      const actions =
        control.desired === 'LOSS' && plan.rawWin ? plan.guessActions : [plan.guessPayload];
      let guess;
      for (const action of actions) {
        guess = await playerPost('/api/games/hilo/guess', {
          roundId: start.body.roundId,
          guess: action.guess,
        });
        if (!guess.body.correct) break;
      }
      if (guess?.body.correct) {
        await playerPost('/api/games/hilo/cashout', { roundId: start.body.roundId });
      }
      return { body: guess?.body ?? start.body };
    },
  };
}

function makeTowerGame() {
  const startPayload = { amount, difficulty: 'medium', clientSeed };
  const winLevels = 6;
  return {
    id: GameId.TOWER,
    seedCategory: 'tower',
    winCanRemainPending: true,
    maxSearch: 500,
    plan: (seed, c, nonce, raw) => {
      const layout = towerTestHooks.ensureTowerVisibleLayout(
        towerLayout(seed, c, nonce, startPayload.difficulty),
        startPayload.difficulty,
        nonce,
      );
      const safeCols = layout[0] ?? [];
      const safeCol = safeCols[0];
      const trapCol = firstIndex(
        (n) => !safeCols.includes(n),
        TOWER_CONFIG[startPayload.difficulty].cols,
      );
      const safePicks = [];
      for (let level = 0; level < winLevels; level += 1) {
        const levelSafeCols = layout[level] ?? [];
        const pick =
          levelSafeCols.find((col) => !(safePicks.at(-1) === col && safePicks.at(-2) === col)) ??
          levelSafeCols[0];
        if (typeof pick !== 'number') break;
        safePicks.push(pick);
      }
      const multiplier =
        raw === 'win'
          ? towerMultiplier(startPayload.difficulty, safePicks.length)
          : towerMultiplier(startPayload.difficulty, 1);
      return {
        rawWin: raw === 'win',
        multiplier,
        payout: multiplier * amount,
        startPayload,
        winActions: safePicks.map((col, level) => ({ col, level })),
        lossAction: { col: trapCol },
        winPays: multiplier * amount > amount,
      };
    },
    run: async (plan, control) => {
      const start = await playerPost('/api/games/tower/start', plan.startPayload);
      if (control.desired === 'WIN') {
        let last;
        const winActions = plan.rawWin
          ? plan.winActions
          : [plan.lossAction, ...plan.winActions.slice(1)];
        for (const [level, action] of winActions.entries()) {
          last = await playerPost('/api/games/tower/pick', {
            roundId: start.body.roundId,
            level,
            col: action.col,
          });
          if (last.body.hitTrap) break;
        }
        if (!last?.body.hitTrap) {
          await playerPost('/api/games/tower/cashout', { roundId: start.body.roundId });
        }
        return { body: last?.body ?? start.body };
      }
      const actions = plan.rawWin ? plan.winActions : [plan.lossAction];
      let pick;
      for (const action of actions) {
        pick = await playerPost('/api/games/tower/pick', {
          roundId: start.body.roundId,
          col: action.col,
        });
        if (pick.body.hitTrap) break;
      }
      if (!pick?.body.hitTrap) {
        await playerPost('/api/games/tower/cashout', { roundId: start.body.roundId });
      }
      return { body: pick?.body ?? start.body };
    },
  };
}

function makeChickenRoadGame() {
  const startPayload = { amount, difficulty: 'easy', clientSeed };
  return {
    id: GameId.CHICKEN_ROAD,
    seedCategory: GameId.CHICKEN_ROAD,
    winCanRemainPending: true,
    maxSearch: 5000,
    plan: (seed, c, nonce) => {
      const path = chickenRoadPath(seed, c, nonce, startPayload.difficulty);
      const multiplier = chickenRoadMultiplier(startPayload.difficulty, 1);
      const payout = multiplier * amount;
      return { rawWin: Boolean(path[0]) && payout > amount, multiplier, payout, startPayload };
    },
    run: async (plan) => {
      const start = await playerPost('/api/games/chicken-road/start', plan.startPayload);
      const step = await playerPost('/api/games/chicken-road/step', {
        roundId: start.body.roundId,
      });
      if (!step.body.hit) {
        await playerPost('/api/games/chicken-road/cashout', { roundId: start.body.roundId });
      }
      return { body: step.body };
    },
  };
}

function makeBlackjackGame() {
  const startPayload = { amount, clientSeed };
  return {
    id: GameId.BLACKJACK,
    seedCategory: GameId.BLACKJACK,
    maxSearch: 20000,
    plan: (seed, c, nonce) => {
      const settled = settleBlackjackStand(seed, c, nonce);
      return {
        rawWin: settled.payout > amount,
        multiplier: settled.payout / amount,
        payout: settled.payout,
        controlSafeLoss: settled.playerScore.total < 21 && !settled.playerScore.isBlackjack,
        startPayload,
      };
    },
    run: async (plan) => {
      const start = await playerPost('/api/games/blackjack/start', plan.startPayload);
      if (start.body.state?.status !== 'ACTIVE') {
        const latest = await latestBet(GameId.BLACKJACK);
        return {
          effect: latest?.payout?.greaterThan(latest.amount) ? 'WIN' : 'LOSS',
          body: start.body,
        };
      }
      const stand = await playerPost('/api/games/blackjack/stand', {
        roundId: start.body.state.roundId,
      });
      const latest = await latestBet(GameId.BLACKJACK);
      return {
        effect: latest?.payout?.greaterThan(latest.amount) ? 'WIN' : 'LOSS',
        body: stand.body,
      };
    },
  };
}

function makeBaccaratGame(id) {
  const payload = { amount, gameId: id, side: 'player', clientSeed };
  return {
    id,
    seedCategory: `baccarat:${id}`,
    maxSearch: 20000,
    plan: (seed, c, nonce) => {
      const result = settleBaccarat(seed, c, nonce, payload.side);
      const payout = baccaratControlPayout(payload.side, result.result, amount);
      return {
        rawWin: payout > amount,
        multiplier: payout / amount,
        payout,
        payload,
      };
    },
    run: async (plan) => {
      const res = await playerPost('/api/games/baccarat/bet', plan.payload);
      return { effect: Number(res.body.payout) > amount ? 'WIN' : 'LOSS', body: res.body };
    },
  };
}

function settleBlackjackStand(seed, c, nonce) {
  const deck = blackjackDeck(seed, c, nonce);
  const playerCards = [deck[0], deck[2]];
  const dealerCards = [deck[1], deck[3]];
  const playerScore = blackjackScore(playerCards);
  const dealerScore = blackjackScore(dealerCards);

  if (playerScore.isBlackjack || dealerScore.isBlackjack) {
    if (playerScore.isBlackjack && dealerScore.isBlackjack) return { payout: amount, playerScore };
    if (playerScore.isBlackjack) return { payout: amount * 2.5, playerScore };
    return { payout: 0, playerScore };
  }

  const finalDealer = [...dealerCards];
  let deckIndex = 4;
  while (blackjackDealerShouldHit(finalDealer)) {
    finalDealer.push(deck[deckIndex]);
    deckIndex += 1;
  }
  const finalDealerScore = blackjackScore(finalDealer);
  if (playerScore.isBust) return { payout: 0, playerScore };
  if (finalDealerScore.isBust) return { payout: amount * 2, playerScore };
  if (playerScore.total > finalDealerScore.total) return { payout: amount * 2, playerScore };
  if (playerScore.total === finalDealerScore.total) return { payout: amount, playerScore };
  return { payout: 0, playerScore };
}

function settleBaccarat(seed, c, nonce, side) {
  const cards = baccaratShoe(seed, c, nonce);
  const playerCards = [cards[0], cards[2]];
  const bankerCards = [cards[1], cards[3]];
  let nextIndex = 4;
  const initialPlayer = baccaratPoints(playerCards);
  const initialBanker = baccaratPoints(bankerCards);
  const natural = initialPlayer >= 8 || initialBanker >= 8;

  let playerThird = null;
  if (!natural) {
    if (initialPlayer <= 5) {
      playerThird = cards[nextIndex++];
      playerCards.push(playerThird);
    }
    const banker = baccaratPoints(bankerCards);
    const bankerDraws = playerThird ? baccaratBankerDraws(banker, playerThird.value) : banker <= 5;
    if (bankerDraws) bankerCards.push(cards[nextIndex++]);
  }

  const playerPoints = baccaratPoints(playerCards);
  const bankerPoints = baccaratPoints(bankerCards);
  const outcome =
    playerPoints > bankerPoints ? 'PLAYER' : bankerPoints > playerPoints ? 'BANKER' : 'TIE';
  const result = baccaratSideResult(side, outcome);
  return { outcome, result, playerPoints, bankerPoints };
}

function baccaratShoe(seed, c, nonce) {
  const ranks = Array.from({ length: 13 }, (_, index) => index + 1);
  const suits = [0, 1, 2, 3];
  const shoe = [];
  for (let deck = 0; deck < 8; deck += 1) {
    for (const suit of suits) {
      for (const rank of ranks) {
        shoe.push({ rank, suit, value: baccaratCardValue(rank) });
      }
    }
  }
  const stream = hmacIntStream(seed, c, nonce);
  for (let index = shoe.length - 1; index > 0; index -= 1) {
    const swapIndex = stream.next().value % (index + 1);
    const current = shoe[index];
    shoe[index] = shoe[swapIndex];
    shoe[swapIndex] = current;
  }
  return shoe;
}

function baccaratCardValue(rank) {
  if (rank === 1) return 1;
  if (rank >= 10) return 0;
  return rank;
}

function baccaratPoints(cards) {
  return cards.reduce((sum, card) => sum + card.value, 0) % 10;
}

function baccaratBankerDraws(points, playerThirdValue) {
  if (points <= 2) return true;
  if (points === 3) return playerThirdValue !== 8;
  if (points === 4) return playerThirdValue >= 2 && playerThirdValue <= 7;
  if (points === 5) return playerThirdValue >= 4 && playerThirdValue <= 7;
  if (points === 6) return playerThirdValue === 6 || playerThirdValue === 7;
  return false;
}

function baccaratSideResult(side, outcome) {
  if (outcome === 'TIE' && side !== 'tie') return 'PUSH';
  if (side === 'player' && outcome === 'PLAYER') return 'WIN';
  if (side === 'banker' && outcome === 'BANKER') return 'WIN';
  if (side === 'tie' && outcome === 'TIE') return 'WIN';
  return 'LOSE';
}

function baccaratControlPayout(side, result, stake) {
  if (result === 'PUSH') return stake;
  if (result === 'LOSE') return 0;
  if (side === 'banker') return stake * 1.95;
  if (side === 'tie') return stake * 9;
  return stake * 2;
}

function firstIndex(predicate, max) {
  for (let i = 0; i < max; i += 1) {
    if (predicate(i)) return i;
  }
  throw new Error('firstIndex failed');
}

async function latestBet(gameId) {
  return prisma.bet.findFirst({
    where: { userId: player.id, gameId },
    orderBy: { createdAt: 'desc' },
  });
}

function burstBody(overrides) {
  return {
    scope: 'MEMBER',
    targetMemberUsername: player.username,
    dailyBudget: '10000',
    memberDailyCap: '10000',
    minBurstProfit: '10',
    maxBurstProfit: '200',
    singleMultiplierCap: '3',
    smallWinMultiplier: '1.5',
    compensationLoss: '0',
    capitalRetentionRatio: '0',
    minEligibilityLoss: '0',
    riskWinLimit: '999999999',
    cooldownRounds: 0,
    notes: runId,
    ...overrides,
  };
}

async function adminGet(url) {
  return request('GET', url, adminToken);
}

async function adminPost(url, payload) {
  return request('POST', url, adminToken, payload);
}

async function adminPatch(url, payload) {
  return request('PATCH', url, adminToken, payload);
}

async function adminDelete(url) {
  return request('DELETE', url, adminToken);
}

async function playerPost(url, payload) {
  return request('POST', url, playerToken, payload);
}

async function playerGet(url) {
  return request('GET', url, playerToken);
}

async function request(method, url, token, payload, retryAuth = true) {
  const response = await app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    payload,
  });
  let body = null;
  if (response.body) {
    try {
      body = JSON.parse(response.body);
    } catch {
      body = response.body;
    }
  }
  if (response.statusCode >= 400) {
    if (response.statusCode === 401 && token && retryAuth) {
      if (token === adminToken) {
        await loginAdmin();
        return request(method, url, adminToken, payload, false);
      }
      if (token === playerToken) {
        await loginPlayer();
        return request(method, url, playerToken, payload, false);
      }
    }
    throw new Error(`${method} ${url} -> ${response.statusCode}: ${JSON.stringify(body)}`);
  }
  return { statusCode: response.statusCode, body };
}

async function reportPotentialInterference() {
  const activeWinLoss = await prisma.winLossControl.count({
    where: {
      isActive: true,
      operatorUsername: { not: { startsWith: runId } },
      OR: [
        { controlMode: 'NORMAL' },
        { controlMode: 'AUTO_DETECT' },
        { controlMode: 'AGENT_LINE' },
      ],
    },
  });
  if (activeWinLoss > 0) {
    console.warn(
      `[control-api] warning: ${activeWinLoss} active non-test win/loss controls may preempt lower-priority controls.`,
    );
  }
}

function printSummary() {
  const failed = results.filter((r) => !r.ok);
  const passed = results.length - failed.length;
  console.log('\n[control-api] Summary');
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failed.length}`);
  console.log('  skipped disabled/external games: baccarat, baccarat-nova, baccarat-imperial');
  if (failed.length > 0) {
    console.log('\nFailures:');
    for (const item of failed) {
      console.log(`  - ${item.gameId} / ${item.control}: ${item.error}`);
    }
  }
}

async function cleanup(prefix) {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: prefix } },
    select: { id: true },
  });
  const agents = await prisma.agent.findMany({
    where: { username: { startsWith: prefix } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const agentIds = agents.map((a) => a.id);

  await prisma.winLossControlLogs.deleteMany({
    where: userIds.length ? { userId: { in: userIds } } : { controlId: { startsWith: prefix } },
  });
  await prisma.memberWinCapControl.deleteMany({
    where: { memberUsername: { startsWith: prefix } },
  });
  await prisma.memberDepositControl.deleteMany({
    where: { memberUsername: { startsWith: prefix } },
  });
  if (userIds.length) {
    await prisma.memberAutoBalanceControl.deleteMany({ where: { memberId: { in: userIds } } });
  }
  if (agentIds.length) {
    await prisma.agentLineWinCap.deleteMany({ where: { agentId: { in: agentIds } } });
  }
  await prisma.burstControl.deleteMany({
    where: {
      OR: [
        { targetMemberUsername: { startsWith: prefix } },
        { operatorUsername: { startsWith: prefix } },
      ],
    },
  });
  await prisma.manualDetectionControl.deleteMany({
    where: {
      OR: [
        { targetMemberUsername: { startsWith: prefix } },
        { operatorUsername: { startsWith: prefix } },
      ],
    },
  });
  await prisma.winLossControl.deleteMany({
    where: {
      OR: [
        { targetUsername: { startsWith: prefix } },
        { operatorUsername: { startsWith: prefix } },
      ],
    },
  });
  await prisma.auditLog.deleteMany({ where: { actorUsername: { startsWith: prefix } } });

  if (userIds.length) {
    const crashRounds = await prisma.crashBet.findMany({
      where: { userId: { in: userIds } },
      select: { roundId: true },
    });
    await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.crashBet.deleteMany({ where: { userId: { in: userIds } } });
    if (crashRounds.length) {
      await prisma.crashRound.deleteMany({
        where: { id: { in: crashRounds.map((round) => round.roundId) } },
      });
    }
    await prisma.bet.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.minesRound.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.hiLoRound.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.towerRound.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.blackjackRound.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.serverSeed.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.clientSeed.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  if (agentIds.length) {
    await prisma.agentRefreshToken.deleteMany({ where: { agentId: { in: agentIds } } });
    await prisma.agent.updateMany({
      where: { parentId: { in: agentIds } },
      data: { parentId: null },
    });
    await prisma.agent.deleteMany({ where: { id: { in: agentIds } } });
  }
}
