-- DAT-03: Prevent duplicate 1:1 conversations via a stable unique key.

ALTER TABLE "Conversation" ADD COLUMN "directMessageKey" TEXT;

-- Backfill keys for existing 1:1 conversations (keep the most recently active per pair).
WITH dm_pairs AS (
  SELECT
    c.id,
    (
      SELECT string_agg(cp."userId"::text, ':' ORDER BY cp."userId")
      FROM "ConversationParticipant" cp
      WHERE cp."conversationId" = c.id
    ) AS participant_key,
    (
      SELECT COUNT(*)::int
      FROM "ConversationParticipant" cp
      WHERE cp."conversationId" = c.id
    ) AS participant_count
  FROM "Conversation" c
  WHERE c."isGroup" = false
),
ranked AS (
  SELECT
    dp.id,
    dp.participant_key,
    ROW_NUMBER() OVER (
      PARTITION BY dp.participant_key
      ORDER BY c."updatedAt" DESC
    ) AS rn
  FROM dm_pairs dp
  JOIN "Conversation" c ON c.id = dp.id
  WHERE dp.participant_count = 2
    AND dp.participant_key IS NOT NULL
)
UPDATE "Conversation" AS c
SET "directMessageKey" = ranked.participant_key
FROM ranked
WHERE c.id = ranked.id
  AND ranked.rn = 1;

CREATE UNIQUE INDEX "Conversation_directMessageKey_key" ON "Conversation"("directMessageKey");
