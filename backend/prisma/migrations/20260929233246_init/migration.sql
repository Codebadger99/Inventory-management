-- CreateTable
CREATE TABLE "Inventory" (
    "Id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("Id")
);
