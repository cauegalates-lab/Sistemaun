import { PREVIEW_LOGIN_ENABLED } from './runtime.js';
import { GoalsRepository as PreviewGoalsRepository } from './goals-repository-preview.js';
import { GoalsRepository as FirebaseGoalsRepository } from './goals-repository-firebase.js';

export const GoalsRepository = PREVIEW_LOGIN_ENABLED ? PreviewGoalsRepository : FirebaseGoalsRepository;
