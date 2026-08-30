import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { gameCatalogRoutes } from './catalog.routes.js';

function registrar(username: string, role = 'PLAYER') {
  let handler: ((request: { userId: string }) => Promise<unknown>) | undefined;
  const get = vi.fn((_path, _options, routeHandler) => {
    handler = routeHandler;
  });
  const findUnique = vi.fn(async () => ({ username, role, disabledAt: null }));
  const fastify = {
    authenticate: vi.fn(),
    get,
    prisma: { user: { findUnique } },
  } as unknown as FastifyInstance;
  return { fastify, findUnique, readHandler: () => handler };
}

describe('new casino game catalog', () => {
  it.each([
    'testplayer',
    'testplayer1',
    'testplayer2',
    'testplayer3',
    'testplayer4',
    'testplayer5',
    'testplayer6',
  ])('returns the curated Jin Baobao catalog to %s', async (username) => {
    const registration = registrar(username);
    await gameCatalogRoutes(registration.fastify);
    const result = (await registration.readHandler()?.({ userId: 'test-user' })) as {
      version: number;
      games: Array<{
        id: string;
        name: string;
        category: string;
        route: string;
        restricted: boolean;
      }>;
    };
    const namesIn = (category: string) =>
      result.games.filter((game) => game.category === category).map((game) => game.name);

    expect(result.version).toBe(2);
    expect(result.games).toHaveLength(27);
    expect(new Set(result.games.map((game) => game.id)).size).toBe(27);
    expect(result.games.every((game) => game.route.startsWith('/games/'))).toBe(true);
    expect(result.games.every((game) => game.restricted)).toBe(true);
    expect(namesIn('熱門')).toEqual(['賽特2', '雷神2', '歡樂水果機']);
    expect(namesIn('拉霸')).toEqual([
      '船長賞金',
      '招財金牛',
      '龍之孵化',
      '賞金女王',
      '幸運寶石',
      '奧林匹斯之門',
      '水果拉霸',
      '夜櫻武士',
      '索爾神鎚',
      '暗夜古堡',
    ]);
    expect(namesIn('捕魚')).toEqual(['深海捕魚', '快樂捕魚', '雷霆戰機']);
    expect(namesIn('棋牌')).toEqual([
      '21點 第1桌',
      '21點 第2桌',
      '10點半 第1桌',
      '10點半 第2桌',
      '黑粒 第1桌',
      '黑粒 第2桌',
      '踩地雷',
      '爬樓梯',
      '推桶',
      '推索',
      '推萬',
    ]);
    expect(result.games.filter((game) => game.route === '/games/blackjack')).toHaveLength(2);
    expect(result.games.some((game) => game.id === 'h5-ocean-king-2')).toBe(false);
    expect(result.games.some((game) => game.id === 'h5-mahjong-ways-2')).toBe(false);
    expect(result.games.some((game) => game.id === 'nebula-slot')).toBe(false);
  });

  it('does not expose any new-casino games to regular members', async () => {
    const registration = registrar('regular-member');
    await gameCatalogRoutes(registration.fastify);
    const result = (await registration.readHandler()?.({ userId: 'member-user' })) as {
      games: Array<{ id: string; restricted: boolean }>;
    };

    expect(result.games).toEqual([]);
  });
});
