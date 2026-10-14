import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '../../api';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/toast';
import { Banner, Button, Sheet, Spinner, TextArea, TextField } from '../../components/ui';
import type { MessageTemplate } from '../../types';

const PLACEHOLDERS: [string, string][] = [
  ['{{customer_first_name}}', 'Susan'],
  ['{{customer_name}}', 'Susan Hirst'],
  ['{{business_name}}', 'Your business name'],
  ['{{owner_name}}', 'Your name'],
  ['{{business_phone}}', 'Your phone number'],
  ['{{ref}}', 'Q-0012 or INV-0003'],
  ['{{title}}', 're-plaster back bedroom'],
  ['{{amount}}', '£1,560.24'],
  ['{{link}}', 'The link to view it'],
  ['{{due_date}}', 'Invoice due date'],
];

/** Edit the wording of every email/text the app sends. */
export function MessagesSettings() {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<MessageTemplate | null>(null);

  useEffect(() => {
    api
      .get<MessageTemplate[]>('/api/templates')
      .then(setTemplates)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <Banner>{error}</Banner>;
  if (!templates) return <Spinner />;

  return (
    <>
      <p className="small muted" style={{ marginBottom: 12 }}>
        Keep it friendly. Customers without an email address get a short text with the link instead.
      </p>
      <ul className="list card">
        {templates.map((t) => (
          <li key={t.key}>
            <button className="list-row" onClick={() => setEditing(t)}>
              <div className="grow">
                <div className="title">{t.label}</div>
                <div className="meta">{t.subject || t.body.split('\n')[0]}</div>
              </div>
              <span className="chev">
                <Icon name="chevronRight" size={18} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.label ?? ''}>
        {editing && (
          <TemplateForm
            template={editing}
            onSaved={(t) => {
              setTemplates((list) => list!.map((x) => (x.key === t.key ? t : x)));
              setEditing(null);
            }}
          />
        )}
      </Sheet>
    </>
  );
}

function TemplateForm({ template, onSaved }: { template: MessageTemplate; onSaved: (t: MessageTemplate) => void }) {
  const toast = useToast();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      onSaved(await api.put<MessageTemplate>(`/api/templates/${template.key}`, { subject, body }));
      toast('Message saved');
    } catch (e) {
      setErrors(e instanceof ApiError && Object.keys(e.fields).length ? e.fields : { body: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <TextField label="Subject" value={subject} onChange={setSubject} error={errors.subject} />
      <TextArea label="Message" value={body} onChange={setBody} error={errors.body} rows={10} />
      <details>
        <summary className="small strong">Words that get filled in automatically</summary>
        <dl className="dl small" style={{ marginTop: 8 }}>
          {PLACEHOLDERS.map(([p, means]) => (
            <div key={p} style={{ display: 'contents' }}>
              <dt>
                <code>{p}</code>
              </dt>
              <dd>{means}</dd>
            </div>
          ))}
        </dl>
      </details>
      <div className="form-actions">
        <Button variant="primary" onClick={save} loading={busy}>
          Save message
        </Button>
      </div>
    </div>
  );
}
