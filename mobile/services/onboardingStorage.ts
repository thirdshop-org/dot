import { createMMKV } from 'react-native-mmkv';
import { ONBOARDING_STEPS, CURRENT_ONBOARDING_VERSION, type OnboardingStep } from '../config/onboarding';
import { safDirectory } from './safDirectory';

const storage = createMMKV({ id: 'vaultdrop-onboarding' });

const COMPLETED_VERSION_KEY = 'completed_version';
const SEEN_STEPS_KEY = 'seen_steps';

export const onboardingStorage = {
  getCompletedVersion(): number | undefined {
    const raw = storage.getNumber(COMPLETED_VERSION_KEY);
    return raw != null ? raw : undefined;
  },

  setCompletedVersion(version: number) {
    storage.set(COMPLETED_VERSION_KEY, version);
  },

  getSeenSteps(): string[] {
    const raw = storage.getString(SEEN_STEPS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  },

  markStepSeen(stepId: string) {
    const seen = this.getSeenSteps();
    if (!seen.includes(stepId)) {
      seen.push(stepId);
      storage.set(SEEN_STEPS_KEY, JSON.stringify(seen));
    }
  },

  getPendingSteps(): OnboardingStep[] {
    const lastVersion = this.getCompletedVersion();
    const seenIds = this.getSeenSteps();
    const folders = safDirectory.getAll();

    return ONBOARDING_STEPS.filter((step) => {
      if (lastVersion != null && step.version <= lastVersion) return false;
      if (seenIds.includes(step.id)) return false;
      if (step.condition === 'has_no_folders' && folders.length > 0) return false;
      return true;
    });
  },

  needsOnboarding(): boolean {
    return this.getPendingSteps().length > 0;
  },

  reset() {
    storage.remove(COMPLETED_VERSION_KEY);
    storage.remove(SEEN_STEPS_KEY);
  },
};
