import { PREVIEW_LOGIN_ENABLED } from './runtime.js';
import { TeamsRepository as PreviewTeamsRepository } from './teams-repository-preview.js';
import { TeamsRepository as FirebaseTeamsRepository } from './teams-repository-firebase.js';

export const TeamsRepository = PREVIEW_LOGIN_ENABLED ? PreviewTeamsRepository : FirebaseTeamsRepository;
