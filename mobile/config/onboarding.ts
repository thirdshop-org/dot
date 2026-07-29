export const CURRENT_ONBOARDING_VERSION = 3;

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
    version: 3,
    title: 'Bienvenue sur Dot.',
    description: 'Votre espace document personnel, toujours accessible.',
    icon: 'waving-hand',
  },
  {
    id: 'select_folders',
    version: 3,
    title: 'Ajoutez vos dossiers',
    description: 'Sélectionnez les dossiers que vous souhaitez synchroniser avec Dot.\n\nAjoutez-en autant que vous voulez, vous pourrez les gérer plus tard.',
    icon: 'create-new-folder',
    action: { type: 'pick_directory', label: 'Ajouter un dossier' },
  },
];
