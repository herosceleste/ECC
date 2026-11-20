import { NextResponse } from 'next/server';
import { appelerApi, ErreurApi } from '@/lib/api';

/**
 * Téléchargement : l'API vérifie les droits, journalise la demande et
 * renvoie un lien signé de quelques minutes, vers lequel on redirige.
 */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { url } = await appelerApi<{ url: string }>(`/documents/${encodeURIComponent(id)}/lien`);
    return NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store' } });
  } catch (erreur) {
    if (erreur instanceof ErreurApi) {
      return new NextResponse(erreur.message, { status: erreur.statut === 403 ? 403 : 404 });
    }
    throw erreur;
  }
}
