import { NextResponse } from 'next/server';
import { appelerApi, ErreurApi } from '@/lib/api';

/** Export des données d'une personne (droit d'accès), en fichier JSON lisible. */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const donnees = await appelerApi<unknown>(`/personnes/${encodeURIComponent(id)}/export`);
    return new NextResponse(JSON.stringify(donnees, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="export-personne-${id}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (erreur) {
    if (erreur instanceof ErreurApi) {
      return new NextResponse(erreur.message, { status: erreur.statut === 403 ? 403 : 404 });
    }
    throw erreur;
  }
}
