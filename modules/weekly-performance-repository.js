import { PREVIEW_LOGIN_ENABLED } from './runtime.js';
import { WeeklyPerformanceRepository as PreviewWeeklyPerformanceRepository } from './weekly-performance-repository-preview.js';
import { WeeklyPerformanceRepository as FirebaseWeeklyPerformanceRepository } from './weekly-performance-repository-firebase.js';

export const WeeklyPerformanceRepository = PREVIEW_LOGIN_ENABLED
  ? PreviewWeeklyPerformanceRepository
  : FirebaseWeeklyPerformanceRepository;
