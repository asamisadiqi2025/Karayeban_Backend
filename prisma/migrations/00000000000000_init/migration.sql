-- This migration creates the initial users table based on current repository schema.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "username" varchar(100) NOT NULL,
  "fullName" varchar(150) NOT NULL,
  "email" varchar(255) NOT NULL,
  "passwordHash" varchar(255) NOT NULL,
  "role" varchar(50) NOT NULL,
  "customRoleId" uuid NULL,
  "marketId" uuid NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "lastLogin" timestamp NULL,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "IDX_users_username_unique" ON "users" ("username");
