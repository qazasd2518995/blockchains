ALTER TABLE "Bet"
  DROP CONSTRAINT IF EXISTS "Bet_amount_positive";

ALTER TABLE "Bet"
  ADD CONSTRAINT "Bet_amount_positive" CHECK (
    "amount" > 0
    OR (
      "amount" = 0
      AND "gameId" = 'storm-of-seth-2'
      AND ("resultData"->>'mode') IN ('standard_free', 'awakening_free')
    )
  ) NOT VALID;
