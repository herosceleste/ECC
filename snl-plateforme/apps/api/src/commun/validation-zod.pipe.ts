import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valide et convertit un corps ou des paramètres avec un schéma Zod. */
export class ValidationZod<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(valeur: unknown): T {
    const resultat = this.schema.safeParse(valeur);
    if (!resultat.success) {
      throw new BadRequestException({
        message: 'Les données envoyées ne sont pas valides.',
        erreurs: resultat.error.issues.map((i) => ({
          champ: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return resultat.data;
  }
}
