import accessProfile from '../server/handlers/access-profile.js';
import firstAccess from '../server/handlers/first-access.js';
import resetPassword from '../server/handlers/reset-password.js';
import sheetSyncQueue from '../server/handlers/sheet-sync-queue.js';
import sheetDelete from '../server/handlers/sheet-delete.js';
import sheetHealth from '../server/handlers/sheet-health.js';
import sheetReconcile from '../server/handlers/sheet-reconcile.js';
import teamProfiles from '../server/handlers/team-profiles.js';
import fcaDailyClose from '../server/handlers/fca-daily-close.js';

const handlers = {
  'access-profile': accessProfile,
  'first-access': firstAccess,
  'reset-password': resetPassword,
  'sheet-sync-queue': sheetSyncQueue,
  'sheet-delete': sheetDelete,
  'sheet-health': sheetHealth,
  'sheet-reconcile': sheetReconcile,
  'team-profiles': teamProfiles,
  'fca-daily-close': fcaDailyClose,
};

export default async function handler(req, res) {
  const action = String(req.query?.action || '').trim();
  const target = handlers[action];
  if (!target) {
    return res.status(404).json({ ok: false, error: 'Rota de API não encontrada.' });
  }
  return target(req, res);
}
