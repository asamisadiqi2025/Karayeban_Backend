"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const bcrypt = __importStar(require("bcrypt"));
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
});
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    console.log('🌱 Seeding database...');
    const afn = await prisma.currency.upsert({
        where: { code: 'AFN' },
        update: {},
        create: { code: 'AFN', name: 'افغانی' },
    });
    const market = await prisma.market.upsert({
        where: { id: '11111111-1111-1111-1111-111111111111' },
        update: {},
        create: {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'مارکت مرکزی',
            address: 'کابل، افغانستان',
            baseCurrencyId: afn.id,
            isSetupComplete: true,
        },
    });
    await prisma.customRole.upsert({
        where: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
        update: {},
        create: {
            id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            name: 'super_admin',
            marketId: market.id,
            permissions: ['*'],
            isSystem: true,
            description: 'دسترسی کامل به سیستم',
        },
    });
    await prisma.customRole.upsert({
        where: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' },
        update: {},
        create: {
            id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            name: 'accountant',
            marketId: market.id,
            permissions: [
                'rent:collect',
                'rent:read',
                'expense:read',
                'expense:write',
                'report:read',
                'report:export',
            ],
            isSystem: true,
            description: 'نقش پیش‌فرض حسابدار',
        },
    });
    const existingAdmin = await prisma.user.findFirst({
        where: { isSuperAdmin: true },
    });
    if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash('Admin@123', 10);
        await prisma.user.create({
            data: {
                email: 'admin@karayeban.com',
                passwordHash: hashedPassword,
                fullName: 'مدیر سیستم',
                isSuperAdmin: true,
                marketId: market.id,
                role: "SUPER_ADMIN",
                isActive: true,
            },
        });
        console.log('✅ سوپرادمین با ایمیل admin@karayeban.com و رمز Admin@123 ایجاد شد.');
    }
    else {
        console.log('✅ سوپرادمین قبلاً وجود دارد.');
    }
    console.log('✅ Seed completed successfully!');
}
main()
    .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map