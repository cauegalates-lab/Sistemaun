import { PREVIEW_LOGIN_ENABLED } from './runtime.js';
import { CommissionAdjustmentsRepository as PreviewRepository } from './commission-adjustments-repository-preview.js';
import { CommissionAdjustmentsRepository as FirebaseRepository } from './commission-adjustments-repository-firebase.js';
export const CommissionAdjustmentsRepository=PREVIEW_LOGIN_ENABLED?PreviewRepository:FirebaseRepository;
