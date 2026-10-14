import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/ui';
import { SECTIONS } from './sections';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <ul className="list card settings-list">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <Link to={`/settings/${s.id}`} className="list-row">
              <span className="icon-tile">
                <Icon name={s.icon} />
              </span>
              <div className="grow">
                <div className="title">{s.title}</div>
                <div className="meta">{s.summary}</div>
              </div>
              <span className="chev">
                <Icon name="chevronRight" size={18} />
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link to="/price-list" className="list-row">
            <span className="icon-tile">
              <Icon name="list" />
            </span>
            <div className="grow">
              <div className="title">Price list</div>
              <div className="meta">Your rates, used to price quotes</div>
            </div>
            <span className="chev">
              <Icon name="chevronRight" size={18} />
            </span>
          </Link>
        </li>
      </ul>
    </>
  );
}
