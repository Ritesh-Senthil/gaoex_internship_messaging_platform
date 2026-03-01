-- AlterTable: Remove deprecated position column from Role
ALTER TABLE "Role" DROP COLUMN IF EXISTS "position";
