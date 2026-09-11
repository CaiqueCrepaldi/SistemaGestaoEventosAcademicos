import { PrismaClient } from "@prisma/client";

// uma instancia so pro processo inteiro, reaproveitada por todos os services
export const prisma = new PrismaClient();
