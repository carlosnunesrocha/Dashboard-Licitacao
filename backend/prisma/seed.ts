import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@exemplo.com';
  const senha = process.env.SEED_ADMIN_SENHA ?? 'admin123';
  const nome = process.env.SEED_ADMIN_NOME ?? 'Administrador';

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    console.log(`Usuário admin '${email}' já existe — seed ignorado.`);
    return;
  }

  const senhaHash = await bcrypt.hash(senha, 12);
  await prisma.user.create({
    data: { nome, email, senhaHash, role: 'admin' },
  });
  console.log(`Usuário admin criado: ${email} (senha: ${senha})`);
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());