import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearEmployeeCode, getEmployeeCode, saveEmployeeCode } from '../app/lib/storage';
import { supabase } from '../app/lib/supabase';

export type Employee = {
  id: string;
  code: string;
  full_name: string | null;
  role: string | null;
  active: boolean;
};

type AuthContextType = {
  loading: boolean;
  employee: Employee | null;
  authError: string | null;
  signInWithCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshEmployee: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ———————————————————————————————————————————————————————————————
// Вспомогательные типы результата для fetchEmployee
type FetchOk       = { status: 'ok'; employee: Employee };
type FetchNF       = { status: 'not_found' };
type FetchInactive = { status: 'inactive'; employee?: Employee };
type FetchErr      = { status: 'error'; message: string };
type FetchResult   = FetchOk | FetchNF | FetchInactive | FetchErr;
// ———————————————————————————————————————————————————————————————

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Без исключений: аккуратно возвращаем статусы
  const fetchEmployee = async (codeRaw: string): Promise<FetchResult> => {
    try {
      const code = (codeRaw ?? '').trim();
      if (!code) return { status: 'not_found' };

      const { data, error } = await supabase
        .from('employees')
        .select('id, code, full_name, role, active')
        .eq('code', code)      // если code числовой в БД, преобразуй: Number(code)
        .maybeSingle();        // вместо .single()

      if (error) return { status: 'error', message: error.message };
      if (!data) return { status: 'not_found' };
      if (!data.active) return { status: 'inactive', employee: data as Employee };

      return { status: 'ok', employee: data as Employee };
    } catch (e: any) {
      return { status: 'error', message: e?.message ?? String(e) };
    }
  };

  const createOrSignInAuthUser = async (code: string) => {
    const email = `${code}@seedscan.local`;

    const tryLogin = await supabase.auth.signInWithPassword({ email, password: code });
    if (!tryLogin.error && tryLogin.data.user) return;

    const signUp = await supabase.auth.signUp({
      email,
      password: code,
      options: { emailRedirectTo: undefined, data: { employee_code: code } },
    });

    if (signUp.error) {
      const relog = await supabase.auth.signInWithPassword({ email, password: code });
      if (relog.error) throw new Error(relog.error.message);
    }
  };

  const signInWithCode = async (code: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      const r = await fetchEmployee(code);

      if (r.status === 'ok') {
        await createOrSignInAuthUser(code);
        await saveEmployeeCode(code);
        setEmployee(r.employee);
        setAuthError(null);
        return;
      }

      // Обработка «не найден/неактивен/ошибка»
      setEmployee(null);
      if (r.status === 'not_found') setAuthError('Код не найден');
      else if (r.status === 'inactive') setAuthError('Сотрудник неактивен');
      else if (r.status === 'error') setAuthError(`Ошибка доступа: ${r.message}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshEmployee = async () => {
    const code = await getEmployeeCode();
    if (!code) {
      setEmployee(null);
      setAuthError(null);
      return;
    }
    const r = await fetchEmployee(code);
    if (r.status === 'ok') {
      setEmployee(r.employee);
      setAuthError(null);
    } else if (r.status === 'inactive') {
      setEmployee(null);
      setAuthError('Сотрудник неактивен');
    } else if (r.status === 'not_found') {
      setEmployee(null);
      setAuthError('Код не найден');
    } else {
      setEmployee(null);
      setAuthError(`Ошибка доступа: ${r.message}`);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    await clearEmployeeCode();
    setEmployee(null);
    setAuthError(null);
  };

  useEffect(() => {
    (async () => {
      try {
        const code = await getEmployeeCode();
        if (!code) return;

        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          try {
            await createOrSignInAuthUser(code);
          } catch (e: any) {
            setAuthError(e?.message ?? 'Не удалось создать/войти в сессию');
          }
        }

        await refreshEmployee();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value = useMemo(
    () => ({ loading, employee, authError, signInWithCode, signOut, refreshEmployee }),
    [loading, employee, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
