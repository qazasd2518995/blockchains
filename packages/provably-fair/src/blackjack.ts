import { hmacIntStream } from './hmac.js';

export interface BlackjackCard {
  rank: number; // 1..13, Ace = 1
  suit: number; // 0..3
}

export interface BlackjackScore {
  total: number;
  soft: boolean;
  isBust: boolean;
  isBlackjack: boolean;
}

export const BLACKJACK_HOUSE_RULES = {
  blackjackPayout: 2.5,
  regularWinPayout: 2,
  pushPayout: 1,
  dealerStandsSoft17: true,
} as const;

export function blackjackDeck(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): BlackjackCard[] {
  const deck: BlackjackCard[] = [];
  for (let suit = 0; suit < 4; suit += 1) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({ rank, suit });
    }
  }

  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const next = stream.next().value as number;
    const j = next % (i + 1);
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
  return deck;
}

export function blackjackCardValue(card: BlackjackCard): number {
  if (card.rank === 1) return 11;
  return Math.min(card.rank, 10);
}

export function blackjackSplitValue(card: BlackjackCard): number {
  return card.rank === 1 ? 11 : Math.min(card.rank, 10);
}

export function blackjackScore(cards: BlackjackCard[]): BlackjackScore {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === 1) {
      aces += 1;
      total += 11;
    } else {
      total += Math.min(card.rank, 10);
    }
  }

  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  soft = aces > 0;

  return {
    total,
    soft,
    isBust: total > 21,
    isBlackjack: cards.length === 2 && total === 21,
  };
}

export function blackjackDealerShouldHit(cards: BlackjackCard[]): boolean {
  const score = blackjackScore(cards);
  if (score.total < 17) return true;
  if (score.total > 17) return false;
  return score.soft && !BLACKJACK_HOUSE_RULES.dealerStandsSoft17;
}
