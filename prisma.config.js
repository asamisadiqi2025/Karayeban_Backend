"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("prisma/config");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.default = (0, config_1.defineConfig)({
    schema: 'prisma/',
    migrations: {
        path: 'prisma/migrations',
        seed: 'ts-node --transpile-only prisma/seed.ts',
    },
    datasource: {
        url: process.env.DATABASE_URL,
    },
});
//# sourceMappingURL=prisma.config.js.map