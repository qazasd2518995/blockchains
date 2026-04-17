export interface ActiveSeedInfo {
  gameCategory: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface ActiveSeedsResponse {
  seeds: ActiveSeedInfo[];
}

export interface RotateSeedRequest {
  gameCategory: string;
}

export interface RotateSeedResponse {
  revealedServerSeed: string;
  revealedSeedHash: string;
  revealedNonce: number;
  newSeedHash: string;
}

export interface UpdateClientSeedRequest {
  seed: string;
}

export interface VerifyBetResponse {
  betId: string;
  gameId: string;
  serverSeed: string | null;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  computedResult: unknown;
  storedResult: unknown;
  matches: boolean;
}
