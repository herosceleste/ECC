import { redirect } from 'next/navigation';
import { sessionCourante } from '@/lib/contexte';

/** Accueil : vers l'espace choisi, ou vers le choix de l'espace. */
export default async function Racine() {
  const session = await sessionCourante();
  redirect(session?.associationId ? '/accueil' : '/espaces');
}
