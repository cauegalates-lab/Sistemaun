import { PREVIEW_LOGIN_ENABLED } from './runtime.js';
import { FcaRepository as PreviewFcaRepository } from './fca-repository-preview.js';
import { FcaRepository as FirebaseFcaRepository } from './fca-repository-firebase.js';

export const FcaRepository = PREVIEW_LOGIN_ENABLED ? PreviewFcaRepository : FirebaseFcaRepository;
