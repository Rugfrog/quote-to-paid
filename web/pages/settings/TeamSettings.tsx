import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage } from '../../api';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/toast';
import { Avatar, Banner, Button, EmptyState, Pill, Sheet, Spinner, TextField, Toggle } from '../../components/ui';
import type { TeamMember } from '../../types';

export function TeamSettings() {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<TeamMember | 'new' | null>(null);

  useEffect(() => {
    api
      .get<TeamMember[]>('/api/team')
      .then(setTeam)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <Banner>{error}</Banner>;
  if (!team) return <Spinner />;

  return (
    <>
      {team.length === 0 ? (
        <div className="card">
          <EmptyState icon="users" title="No team members yet">
            Add the people who work on your jobs so you can see who’s where.
          </EmptyState>
        </div>
      ) : (
        <ul className="list card">
          {team.map((m) => (
            <li key={m.id}>
              <button className="list-row" onClick={() => setEditing(m)}>
                <Avatar name={m.name} />
                <div className="grow">
                  <div className="title">
                    {m.name} {!m.active && <Pill>Not active</Pill>}
                  </div>
                  <div className="meta">{[m.role_label, m.phone].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="chev">
                  <Icon name="chevronRight" size={18} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 14 }}>
        <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
          Add team member
        </Button>
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add team member' : 'Edit team member'}>
        {editing !== null && (
          <MemberForm
            member={editing === 'new' ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={(list) => {
              setTeam(list);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function MemberForm({
  member,
  onSaved,
  onCancel,
}: {
  member?: TeamMember;
  onSaved: (team: TeamMember[]) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(member?.name ?? '');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [role, setRole] = useState(member?.role_label ?? '');
  const [active, setActive] = useState(member?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const body = { name, phone, role_label: role, active };
      const list = member
        ? await api.put<TeamMember[]>(`/api/team/${member.id}`, body)
        : await api.post<TeamMember[]>('/api/team', body);
      toast(member ? 'Saved' : `${name} added`);
      onSaved(list);
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { name: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <TextField label="Name" value={name} onChange={setName} error={errors.name} autoFocus={!member} />
      <TextField label="Role" value={role} onChange={setRole} error={errors.role_label} optional placeholder="e.g. Plasterer, Labourer" />
      <TextField label="Phone" type="tel" inputMode="tel" value={phone} onChange={setPhone} error={errors.phone} optional />
      {member && <Toggle label="Active" checked={active} onChange={setActive} hint="Turn off for people who no longer work with you." />}
      <div className="form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {member ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  );
}
