import bcrypt from 'bcrypt';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  blackjackDealerShouldHit,
  blackjackDeck,
  blackjackScore,
  chickenRoadMultiplier,
  chickenRoadPath,
  diceDetermine,
  diceMultiplier,
  getHotlineReelCount,
  getHotlineRowCount,
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
  sha256,
  TOWER_CONFIG,
  towerLayout,
  towerMultiplier,
  wheelMultiplier,
  wheelSpin,
} from '@bg/provably-fair';
import { GameId, SLOT_GAME_IDS } from '@bg/shared';

const prisma = new PrismaClient();
const amount = 100;
const password = 'ControlApiTest123!';
const runId = `ctrl_api_${new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, '')
  .slice(0, 14)}`;
const clientSeed = `${runId}_client`;
const testSeedBase = `${runId}_server`;
const gameFilter = argCsv('--game');
const controlFilter = argCsv('--control');

const results = [];
let app;
let buildServer;
let adminToken;
let playerToken;
let adminAgent;
let lineAgent;
let player;

const slotGameIds = [...SLOT_GAME_IDS];

const httpGames = [
  makeDiceGame(),
  makeKenoGame(),
  makeWheelGame(),
  makePlinkoGame(),
  makeRouletteGame(GameId.MINI_ROULETTE, '/api/games/mini-roulette/bet', 'mini roulette'),
  makeRouletteGame(GameId.CARNIVAL, '/api/games/carnival/bet', 'carnival roulette'),
  makeMinesGame(),
  makeHiloGame(),
  makeTowerGame(),
  makeChickenRoadGame(),
  makeBlackjackGame(),
  ...slotGameIds.map(makeHotlineGame),
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
  ({ buildServer } = await import('../dist/server.js'));
  console.log(`[control-api] runId=${runId}`);
  app = await buildServer();
  await cleanup(runId);
  await setupFixture();
  await login();
  await reportPotentialInterference();
  const games = selectedGames();
  const controls = selectedControls();
  await precomputePlans(games, controls);

  let done = 0;
  const total = games.length * controls.length;
  for (const game of games) {
    for (const control of controls) {
      done += 1;
      process.stdout.write(`[${done}/${total}] ${game.id} :: ${control.key} ... `);
      const result = await runControlGameCase(control, game);
      results.push(result);
      console.log(result.ok ? `PASS ${result.note ?? ''}` : `FAIL ${result.error}`);
    }
  }

  printSummary();
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

function selectedGames() {
  return gameFilter ? httpGames.filter((game) => gameFilter.has(game.id)) : httpGames;
}

function selectedControls() {
  return controlFilter
    ? controlCases.filter((control) => controlFilter.has(control.key))
    : controlCases;
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

async function precomputePlans(games, controls) {
  for (const game of games) {
    game.plans = {};
    for (const control of controls) {
      game.plans[control.key] = findPlan(game, control.raw, control.acceptPlan);
    }
  }
}

async function runControlGameCase(control, game) {
  let created;
  try {
    await resetOpenRounds();
    created = await control.create();
    const controlId = created.body.id;
    await assertListed(control, controlId);

    if (control.supportsToggle) {
      await adminPatch(control.toggleUrl(controlId), { isActive: false });
      await adminPatch(control.toggleUrl(controlId), { isActive: true });
    }

    const plan = game.plans[control.key];
    await prepareSeed(game.seedCategory, plan.seed, plan.nonce);
    const run = await game.run(plan);
    const log = await latestControlLog(controlId, game.id);

    const pendingWinPass =
      control.desired === 'WIN' && game.winCanRemainPending && run.effect === 'WIN' && !log;
    if (pendingWinPass) {
      return {
        ok: true,
        gameId: game.id,
        control: control.key,
        note: 'pending win effect verified',
      };
    }

    if (!log) {
      throw new Error(`no WinLossControlLogs row for ${controlId}; effect=${run.effect}`);
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

    return { ok: true, gameId: game.id, control: control.key, note: `log=${log.flipReason}` };
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
  if (control.key.startsWith('manual_detection')) {
    await adminPost('/api/admin/controls/manual-detection/deactivate', { id }).catch(
      () => undefined,
    );
  }
  await adminDelete(control.deleteUrl(id));
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
    where: { userId: player.id, gameId: GameId.CHICKEN_ROAD, status: 'PENDING' },
    data: { status: 'VOID', settledAt: new Date() },
  });
}

function findPlan(game, raw, acceptPlan) {
  const wantWin = raw === 'win';
  const seed = `${testSeedBase}:${game.id}:plan:${raw}`;
  for (let nonce = 1; nonce <= (game.maxSearch ?? 50000); nonce += 1) {
    const plan = game.plan(seed, clientSeed, nonce, raw);
    if (plan.rawWin === wantWin && (!acceptPlan || acceptPlan(plan)))
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

function makePlinkoGame() {
  const payload = { amount, rows: 10, risk: 'medium', clientSeed };
  return {
    id: GameId.PLINKO,
    seedCategory: 'plinko',
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

function makeMinesGame() {
  const startPayload = { amount, mineCount: 3, clientSeed };
  return {
    id: GameId.MINES,
    seedCategory: 'mines',
    winCanRemainPending: true,
    maxSearch: 500,
    plan: (seed, c, nonce, raw) => {
      const positions = minesPositions(seed, c, nonce, startPayload.mineCount);
      const winCell = firstIndex((n) => !positions.includes(n), 25);
      const lossCell = positions[0];
      const multiplier = minesMultiplier(startPayload.mineCount, 1);
      return {
        rawWin: raw === 'win',
        multiplier,
        payout: multiplier * amount,
        startPayload,
        winAction: { cellIndex: winCell },
        lossAction: { cellIndex: lossCell },
        winPays: multiplier * amount > amount,
      };
    },
    run: async (plan) => {
      const start = await playerPost('/api/games/mines/start', plan.startPayload);
      const action = plan.rawWin ? plan.winAction : plan.lossAction;
      const reveal = await playerPost('/api/games/mines/reveal', {
        roundId: start.body.roundId,
        cellIndex: action.cellIndex,
      });
      return { effect: reveal.body.hitMine ? 'LOSS' : 'WIN', body: reveal.body };
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
        for (const guess of ['higher', 'lower']) {
          const current = hiloDraw(seed, c, nonce, 0);
          const next = hiloDraw(seed, c, nonce, 1);
          const rawCorrect =
            guess === 'higher' ? next.rank >= current.rank : next.rank <= current.rank;
          const chance =
            guess === 'higher'
              ? hiloProbHigherOrEqual(current.rank)
              : hiloProbLowerOrEqual(current.rank);
          const multiplier = hiloMultiplier(chance);
          if (rawCorrect && multiplier * amount > amount) {
            return {
              rawWin: true,
              multiplier,
              payout: multiplier * amount,
              startPayload,
              guessPayload: { guess },
            };
          }
        }
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
    run: async (plan) => {
      const start = await playerPost('/api/games/hilo/start', plan.startPayload);
      const guess = await playerPost('/api/games/hilo/guess', {
        roundId: start.body.roundId,
        guess: plan.guessPayload.guess,
      });
      return { effect: guess.body.correct ? 'WIN' : 'LOSS', body: guess.body };
    },
  };
}

function makeTowerGame() {
  const startPayload = { amount, difficulty: 'medium', clientSeed };
  const winLevels = 4;
  return {
    id: GameId.TOWER,
    seedCategory: 'tower',
    winCanRemainPending: true,
    maxSearch: 500,
    plan: (seed, c, nonce, raw) => {
      const layout = towerLayout(seed, c, nonce, startPayload.difficulty);
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
    run: async (plan) => {
      const start = await playerPost('/api/games/tower/start', plan.startPayload);
      if (plan.rawWin) {
        let last;
        for (const action of plan.winActions) {
          last = await playerPost('/api/games/tower/pick', {
            roundId: start.body.roundId,
            level: action.level,
            col: action.col,
          });
          if (last.body.hitTrap) break;
        }
        return { effect: last?.body.hitTrap ? 'LOSS' : 'WIN', body: last?.body ?? start.body };
      }
      const action = plan.lossAction;
      const pick = await playerPost('/api/games/tower/pick', {
        roundId: start.body.roundId,
        col: action.col,
      });
      return { effect: pick.body.hitTrap ? 'LOSS' : 'WIN', body: pick.body };
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
      return { effect: step.body.hit ? 'LOSS' : 'WIN', body: step.body };
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
    minBurstProfit: '1',
    maxBurstProfit: '20',
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
  console.log(
    '  skipped realtime socket games: rocket, aviator, space-fleet, jetx, balloon, jetx3, double-x',
  );
  console.log('  skipped disabled/external games: baccarat, baccarat-nova, baccarat-imperial');
  console.log('  skipped registry-only game without backend route: plinko-x');
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
    await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.crashBet.deleteMany({ where: { userId: { in: userIds } } });
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
