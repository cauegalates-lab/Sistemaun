import { PREVIEW_LOGIN_ENABLED } from './runtime.js';
import { SalesRepository as PreviewSalesRepository } from './repository-preview.js';
import { SalesRepository as FirebaseSalesRepository } from './repository-firebase.js';

export const SalesRepository = PREVIEW_LOGIN_ENABLED ? PreviewSalesRepository : FirebaseSalesRepository;
