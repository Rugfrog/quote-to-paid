import { Router } from 'express';
import { teamMemberSchema } from '../../shared/schemas';
import { requireUser } from '../auth';
import type { DB } from '../db/db';
import { idParam, notFound, validate, withBools } from '../http';

export function teamRouter(db: DB): Router {
  const router = Router();
  router.use(requireUser);

  const all = () =>
    (db.prepare('SELECT * FROM team_members ORDER BY active DESC, name').all() as { active: number }[]).map((r) =>
      withBools(r, ['active']),
    );

  router.get('/', (_req, res) => {
    res.json(all());
  });

  router.post('/', (req, res) => {
    const input = validate(teamMemberSchema, req.body);
    db.prepare('INSERT INTO team_members (name, phone, role_label, active) VALUES (?, ?, ?, ?)').run(
      input.name,
      input.phone,
      input.role_label,
      input.active ? 1 : 0,
    );
    res.status(201).json(all());
  });

  router.put('/:id', (req, res) => {
    const id = idParam(req.params.id);
    if (!db.prepare('SELECT 1 FROM team_members WHERE id = ?').get(id)) throw notFound('That team member');
    const input = validate(teamMemberSchema, req.body);
    db.prepare('UPDATE team_members SET name = ?, phone = ?, role_label = ?, active = ? WHERE id = ?').run(
      input.name,
      input.phone,
      input.role_label,
      input.active ? 1 : 0,
      id,
    );
    res.json(all());
  });

  return router;
}
