ALTER TABLE "Agent"
ADD COLUMN "excludeFromControlSettlement" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Agent_excludeFromControlSettlement_idx"
ON "Agent"("excludeFromControlSettlement");
