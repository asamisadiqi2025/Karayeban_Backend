"use strict";
const { defineConfig } = require('prisma/config');
const dotenv = require('dotenv');

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required by prisma.config.js');
}

module.exports = defineConfig({
    schema: 'prisma/',
    migrations: {
        path: 'prisma/migrations',
        seed: 'ts-node --transpile-only prisma/seed.ts',
    },
    datasource: {
        url: databaseUrl,
    },
});

//# sourceMappingURL=prisma.config.js.map