import { isAdmin } from './admin-session.js';

export function isReviewer(
  uid: string | undefined,
  reviewerUids: Set<string> | undefined,
  adminUids: Set<string> | undefined,
): boolean {
  if (!uid) return false;
  if (isAdmin(uid, adminUids)) return true;
  return reviewerUids !== undefined && reviewerUids.has(uid);
}
