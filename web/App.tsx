import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ToastProvider } from './components/toast';
import { Spinner } from './components/ui';
import { AdminPage } from './pages/AdminPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { CustomersPage } from './pages/CustomersPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MorePage } from './pages/MorePage';
import { NewEnquiryPage } from './pages/NewEnquiryPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PriceListPage } from './pages/PriceListPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { SettingsSectionPage } from './pages/settings/SettingsSectionPage';
import { SessionProvider, useSession } from './session';

export function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <Routes>
          {/* Customer-facing pages (no login) arrive in Stage 2: /q/:token etc. */}
          <Route path="/*" element={<OwnerApp />} />
        </Routes>
      </SessionProvider>
    </ToastProvider>
  );
}

function OwnerApp() {
  const { user, business, loading } = useSession();
  if (loading || (user && !business)) return <Spinner label="Loading Quote to Paid…" />;
  if (!user) return <LoginPage />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/enquiries/new" element={<NewEnquiryPage />} />
        <Route path="/price-list" element={<PriceListPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/:section" element={<SettingsSectionPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route
          path="/admin"
          element={user.role === 'agency' ? <AdminPage /> : <Navigate to="/" replace />}
        />
        <Route path="/quotes/*" element={<ComingSoonPage area="quotes" />} />
        <Route path="/jobs/*" element={<ComingSoonPage area="jobs" />} />
        <Route path="/money/*" element={<ComingSoonPage area="money" />} />
        <Route path="/outbox" element={<ComingSoonPage area="outbox" />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
