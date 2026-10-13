import { ButtonLink, EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState icon="alert" title="Page not found" action={<ButtonLink to="/" variant="primary">Go to home</ButtonLink>}>
        That page doesn’t exist, or the link is out of date.
      </EmptyState>
    </div>
  );
}
