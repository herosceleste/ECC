/** Codes des modules de la plateforme (document d'architecture, section 4). */
export const MODULES = {
  M1: 'Travaux et entretien',
  M2: 'Coordination des bénévoles',
  M3: 'Accueil des bénévoles',
  M4: 'Démarches des locataires',
  M5: 'Tableau de bord',
  M6: 'Espace locataire et gestion locative',
  M7: 'Instruction des demandes',
  M8: 'États des lieux numériques',
  M9: 'Patrimoine et projets immobiliers',
  M10: 'Dons et donateurs',
  M11: 'Parcours et relogement',
  M12: 'Agenda et rendez-vous',
  M13: 'Formation et compétences',
  M14: 'Enquêtes et retours',
} as const;

export type CodeModule = keyof typeof MODULES;

export const CODES_MODULES = Object.keys(MODULES) as CodeModule[];

export function estCodeModule(valeur: unknown): valeur is CodeModule {
  return typeof valeur === 'string' && valeur in MODULES;
}
