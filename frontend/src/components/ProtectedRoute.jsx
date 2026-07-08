import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../utils/AuthContext';
import strings from '../strings';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  useTranslation();

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>{strings.common.loading}</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
