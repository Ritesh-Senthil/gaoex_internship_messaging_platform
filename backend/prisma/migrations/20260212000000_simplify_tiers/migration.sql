-- Simplify role tiers from 4 (Owner/Admin/Moderator/Member) to 3 (Owner/Admin/Member)
-- Merge old Moderator (tier 2) and Member (tier 3) into new Member (tier 2)

-- Migrate tier 3 (old Member) -> tier 2 (new Member)
UPDATE "Role" SET "tier" = 2 WHERE "tier" = 3;

-- Update default tier in schema from 3 to 2
ALTER TABLE "Role" ALTER COLUMN "tier" SET DEFAULT 2;
