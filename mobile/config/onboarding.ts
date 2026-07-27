export const CURRENT_ONBOARDING_VERSION = 1;

export type OnboardingAction = {
  type: 'pick_directory';
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
    version: 1,
    title: 'Bienvenue sur Dot.',
    description: 'Votre espace document personnel, toujours accessible.',
    icon: 'waving-hand',
  },
  {
    id: 'folder_explanation',
    version: 1,
    title: 'Pourquoi un dossier dédié ?',
    description: 'Depuis Android 13, les applications ne peuvent plus accéder librement au dossier Téléchargements (par sécurité).\n\nDot. utilise un mécanisme spécial (SAF) pour lire vos fichiers. En créant un dossier dédié, vous autorisez l\'application à y accéder en toute sécurité.\n\n→ Déplacez vos documents dans ce dossier et ils apparaîtront automatiquement dans Dot.',
    icon: 'folder-off',
  },
  {
    id: 'create_folder',
    version: 1,
    title: 'Créez votre dossier',
    description: 'Sélectionnez ou créez un dossier dans le sélecteur ci-dessous.',
    icon: 'create-new-folder',
    action: { type: 'pick_directory', label: 'Sélectionner un dossier' },
    condition: 'has_no_folders',
  },
];
