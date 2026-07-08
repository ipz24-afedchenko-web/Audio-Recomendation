import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authAPI
      .getMe()
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    await authAPI.login(username, password);
    const meRes = await authAPI.getMe();
    setUser(meRes.data);
    return meRes.data;
  };

  const register = async (username, email, password) => {
    await authAPI.register({ username, email, password });
    const meRes = await authAPI.getMe();
    setUser(meRes.data);
    return meRes.data;
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      // cookie deletion is best-effort
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
