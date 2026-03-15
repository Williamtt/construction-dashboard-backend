/*
  Warnings:

  - You are about to drop the column `cwa_township_dataset_id` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `weather_county` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `weather_township` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "cwa_township_dataset_id",
DROP COLUMN "weather_county",
DROP COLUMN "weather_township";
