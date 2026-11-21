import { NextResponse } from 'next/server';
import { appelerApi, ErreurApi } from '@/lib/api';

/** Mes activités au format iCalendar, à ouvrir avec son agenda (M2-F06). */
export async function GET() {
  try {
    const contenu = await appelerApi<string>('/benevoles/moi/agenda.ics', { brut: true });
    return new NextResponse(contenu, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="activites-snl.ics"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (erreur) {
    if (erreur instanceof ErreurApi) return new NextResponse(erreur.message, { status: erreur.statut });
    throw erreur;
  }
}
