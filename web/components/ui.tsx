import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

// ---------------------------------------------------------------- Button

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  loading?: boolean;
  icon?: IconName;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  loading,
  icon,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', !children && 'btn-icon', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === 'sm' ? 17 : 19} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  block,
}: {
  to: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  children?: ReactNode;
  block?: boolean;
}) {
  return (
    <Link to={to} className={['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block'].filter(Boolean).join(' ')}>
      {icon && <Icon name={icon} size={size === 'sm' ? 17 : 19} />}
      {children}
    </Link>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------- Fields

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}

/** Wraps an input with its label, hint and error, wired up for screen readers. */
export function FieldShell({ label, error, hint, optional, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="optional"> (optional)</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && (
        <span className="error" id={errorId}>
          {error}
        </span>
      )}
      {hint && !error && (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  prefix?: string;
  suffix?: string;
};

export function TextField({ label, value, onChange, error, hint, optional, prefix, suffix, ...rest }: InputProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional}>
      {(aria) => {
        const input = <input className="input" value={value} onChange={(e) => onChange(e.target.value)} {...aria} {...rest} />;
        if (!prefix && !suffix) return input;
        return (
          <div className="input-group">
            {prefix && <span className="prefix">{prefix}</span>}
            {input}
            {suffix && <span className="suffix">{suffix}</span>}
          </div>
        );
      }}
    </FieldShell>
  );
}

type TextAreaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
};

export function TextArea({ label, value, onChange, error, hint, optional, ...rest }: TextAreaProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional}>
      {(aria) => <textarea className="textarea" value={value} onChange={(e) => onChange(e.target.value)} {...aria} {...rest} />}
    </FieldShell>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  error,
  hint,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  error?: string;
  hint?: ReactNode;
}) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {(aria) => (
        <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)} {...aria}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <label className="toggle" htmlFor={id}>
      <span>
        <span className="strong">{label}</span>
        {hint && <span className="small muted" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  const name = useId();
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="label" style={{ padding: 0, marginBottom: 6 }}>
        {label}
      </legend>
      <div className="segmented">
        {options.map((o) => (
          <label key={o.value}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="search">
      <Icon name="search" size={18} />
      <input
        className="input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
      />
    </div>
  );
}

// ---------------------------------------------------------------- Sheet (accessible modal using <dialog>)

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // tap on the backdrop
      }}
    >
      {open && (
        <>
          <div className="sheet-head">
            <h2 id={titleId}>{title}</h2>
            <Button variant="ghost" icon="x" onClick={onClose} aria-label="Close" />
          </div>
          <div className="sheet-body">{children}</div>
        </>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------- Page bits

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <>
      {back && (
        <Link to={back.to} className="back-link">
          <Icon name="chevronLeft" size={18} /> {back.label}
        </Link>
      )}
      <header className="page-head">
        <div className="titles">
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </header>
    </>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={26} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Banner({ kind = 'error', children }: { kind?: 'error' | 'info' | 'warn' | 'ok'; children: ReactNode }) {
  return (
    <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={kind === 'ok' ? 'check' : kind === 'info' ? 'sparkle' : 'alert'} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Pill({ kind, children }: { kind?: 'brand' | 'ok' | 'warn' | 'danger' | 'info'; children: ReactNode }) {
  return <span className={`pill${kind ? ` pill-${kind}` : ''}`}>{children}</span>;
}

export function initials(name: string): string {
  const words = name
    .replace(/[^A-Za-z\s&]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w !== '&' && !['and', 'the', 'ltd'].includes(w.toLowerCase()));
  return (words[0]?.[0] ?? '?').toUpperCase() + (words[1]?.[0] ?? '').toUpperCase();
}

export function BrandMark({ name, logoUrl, size = 40 }: { name: string; logoUrl: string | null; size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {logoUrl ? <img src={logoUrl} alt="" /> : initials(name)}
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {initials(name)}
    </span>
  );
}
