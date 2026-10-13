import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { brandVariables } from '../shared/colour';
import { api } from './api';
import type { Business, PublicBranding, User } from './types';

/** Apply a brand colour to the whole app via CSS variables. */
export function applyBrand(colour: string) {
  const vars = brandVariables(colour);
  for (const [key, value] of Object.entries(vars)) document.documentElement.style.setProperty(key, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--brand']);
}

interface Session {
  user: User | null;
  business: Business | null;
  branding: PublicBranding | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setBusiness: (business: Business) => void;
  refreshBusiness: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session>(null as unknown as Session);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusinessState] = useState<Business | null>(null);
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const [loading, setLoading] = useState(true);

  const setBusiness = useCallback((b: Business) => {
    setBusinessState(b);
    applyBrand(b.brand_colour);
    document.title = `${b.name} · Quote to Paid`;
  }, []);

  const refreshBusiness = useCallback(async () => {
    setBusiness(await api.get<Business>('/api/business'));
  }, [setBusiness]);

  // Load branding (public) and the current login on start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await api.get<PublicBranding>('/api/business/public');
        if (cancelled) return;
        setBranding(b);
        applyBrand(b.brand_colour);
      } catch {
        /* the login page still works without branding */
      }
      try {
        const { user } = await api.get<{ user: User | null }>('/api/auth/me');
        if (cancelled) return;
        if (user) {
          await refreshBusiness();
          setUser(user);
        }
      } catch {
        /* not logged in */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshBusiness]);

  // Any 401 from the API sends you back to the login page.
  useEffect(() => {
    const onLoggedOut = () => setUser(null);
    window.addEventListener('qtp:logged-out', onLoggedOut);
    return () => window.removeEventListener('qtp:logged-out', onLoggedOut);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  return (
    <SessionContext.Provider value={{ user, business, branding, loading, setUser, setBusiness, refreshBusiness, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

/** Business settings — only use inside the logged-in app, where they're always loaded. */
export function useBusiness(): Business {
  const { business } = useSession();
  if (!business) throw new Error('Business not loaded');
  return business;
}
