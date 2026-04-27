const LOBBY_COVER_OVERRIDES: Record<string, string> = {
  hotline: '/slots/cyber/cover.png',
  'fruit-slot': '/slots/fruit/cover.png',
  'fortune-slot': '/slots/fortune/cover.png',
  'ocean-slot': '/slots/ocean/cover.png',
  rocket: '/games/lobby/rocket.jpg',
  aviator: '/games/lobby/aviator.jpg',
  'space-fleet': '/games/lobby/space-fleet.jpg',
  jetx: '/games/lobby/jetx.jpg',
  balloon: '/games/lobby/balloon.jpg',
  jetx3: '/games/lobby/jetx3.jpg',
  'double-x': '/games/lobby/double-x.jpg',
  'plinko-x': '/games/lobby/plinko-x.jpg',
};

export function getLobbyGameCover(gameId: string): string {
  return LOBBY_COVER_OVERRIDES[gameId] ?? `/games/${gameId}.jpg`;
}
