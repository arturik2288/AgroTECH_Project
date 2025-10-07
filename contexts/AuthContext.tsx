import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearEmployeeCode, getEmployeeCode, saveEmployeeCode } from '../app/lib/storage';
import { supabase } from '../app/lib/supabase';

type Employee = {
  id: string;
  code: string;
  full_name: string | null;
  role: string | null;
  active: boolean;
};

type AuthContextType = {
  loading: boolean;
  employee: Employee | null;
  signInWithCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshEmployee: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);

  const fetchEmployee = async (code: string) => {
    const { data, error } = await supabase
      .from('employees')
      .select('id, code, full_name, role, active')
      .eq('code', code)
      .eq('active', true)
      .single();

    if (error || !data) throw new Error('Код не найден или сотрудник неактивен');
    return data as Employee;
  };

  const createOrSignInAuthUser = async (code: string) => {
    const email = `${code}@seedscan.local`;
    // пробуем обычный логин
    const tryLogin = await supabase.auth.signInWithPassword({ email, password: code });
    if (!tryLogin.error && tryLogin.data.user) return;

    // если учётки нет — создаём
    const signUp = await supabase.auth.signUp({
      email,
      password: code,
      options: {
        emailRedirectTo: undefined,
        data: { employee_code: code },
      },
    });

    if (signUp.error) {
      // если кто-то уже создал, попробуем войти ещё раз
      const relog = await supabase.auth.signInWithPassword({ email, password: code });
      if (relog.error) throw new Error(relog.error.message);
      return;
    }
  };

  const signInWithCode = async (code: string) => {
    setLoading(true);
    try {
      const emp = await fetchEmployee(code);
      await createOrSignInAuthUser(code);
      await saveEmployeeCode(code);
      setEmployee(emp);
    } finally {
      setLoading(false);
    }
  };

  const refreshEmployee = async () => {
    const code = await getEmployeeCode();
    if (!code) {
      setEmployee(null);
      return;
    }
    const emp = await fetchEmployee(code);
    setEmployee(emp);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    await clearEmployeeCode();
    setEmployee(null);
  };

  useEffect(() => {
    // восстановим сессию/сотрудника при старте
    (async () => {
      try {
        const code = await getEmployeeCode();
        if (code) {
          // если сессия уже есть, просто обновим данные сотрудника
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            await createOrSignInAuthUser(code);
          }
          const emp = await fetchEmployee(code);
          setEmployee(emp);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value = useMemo(
    () => ({ loading, employee, signInWithCode, signOut, refreshEmployee }),
    [loading, employee]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
