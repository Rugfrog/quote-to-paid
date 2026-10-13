import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { userUpdateSchema } from '../../shared/schemas';
import { requireAgency } from '../auth';
import type { DB } from '../db/db';
import { isDemoMode } from '../demo';
import { HttpError, idParam, notFound, validate } from '../http';

/** Agency-only: manage the client's logins. Branding, prices and settings use the normal settings API. */
export function adminRouter(db: DB): Router {
  const router = Router();
  router.use(requireAgency);

  const users = () => db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY role DESC, id').all();

  router.get('/users', (_req, res) => {
    res.json(users());
  });

  router.put('/users/:id', (req, res) => {
    if (isDemoMode()) {
      throw new HttpError(403, 'Logins can’t be changed in the public demo, so everyone can still get in.');
    }
    const id = idParam(req.params.id);
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) throw notFound('That login');
    const input = validate(userUpdateSchema, req.body);
    if (input.email) {
      const clash = db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(input.email, id);
      if (clash) throw new HttpError(400, 'Please check the highlighted fields.', { email: 'Another login already uses this email' });
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(input.email, id);
    }
    if (input.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(input.name, id);
    if (input.password) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(input.password, 10), id);
      // Log them out everywhere else after a password change.
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND user_id != ?').run(id, req.user!.id);
    }
    res.json(users());
  });

  return router;
}
