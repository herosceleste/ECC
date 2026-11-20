import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../commun/decorateurs';
import { PrismaService } from '../prisma/prisma.service';

/** Sonde de disponibilité pour Docker et la supervision. */
@Controller('sante')
export class SanteController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  async verifier() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { statut: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ statut: 'degrade', base: 'injoignable' });
    }
  }
}
