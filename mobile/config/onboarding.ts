export const CURRENT_ONBOARDING_VERSION = 2;

export type OnboardingAction = {
  type: 'pick_directory' | 'recursive_scan';
  label: string;
};

export type OnboardingStep = {
  id: string;
  version: number;
  title: string;
  description: string;
  icon: string;
  action?: OnboardingAction;
  condition?: 'has_no_folders';
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    version: 2,
    title: 'Bienvenue sur Dot.',
    description: 'Votre espace document personnel, toujours accessible.',
    icon: 'waving-hand',
  },
  {
    id: 'pick_root_folder',
    version: 2,
    title: 'Choisissez votre dossier principal',
    description: 'Sélectionnez la racine de votre stockage dans le sélecteur.\n\nDot. va scanner automatiquement tous les sous-dossiers (photos, téléchargements, documents…).',
    icon: 'create-new-folder',
    action: { type: 'recursive_scan', label: 'Choisir le dossier principal' },
    condition: 'has_no_folders',
  },
];
