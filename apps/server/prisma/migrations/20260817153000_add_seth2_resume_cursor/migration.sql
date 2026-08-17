ALTER TABLE "Seth2FeatureSequence"
  ADD COLUMN "resumeCursor" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Seth2FeatureSequence"
  ADD CONSTRAINT "Seth2FeatureSequence_resumeCursor_check"
  CHECK ("resumeCursor" >= 0);
