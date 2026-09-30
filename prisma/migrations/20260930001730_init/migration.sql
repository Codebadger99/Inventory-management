/*
  Warnings:

  - Added the required column `size` to the `Inventory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "size" INTEGER NOT NULL;
