import { Prisma } from '@prisma/client';

/** Cliente de transação do Prisma (o `tx` recebido dentro de um prisma.$transaction). */
export type TransactionClient = Prisma.TransactionClient;
