/*
  Warnings:

  - The primary key for the `Inventory` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `Id` on the `Inventory` table. All the data in the column will be lost.
  - You are about to alter the column `size` on the `Inventory` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- AlterTable
ALTER TABLE "Inventory" DROP CONSTRAINT "Inventory_pkey",
DROP COLUMN "Id",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "size" SET DATA TYPE INTEGER,
ADD CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id");
