import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { musicAPI } from '../services/api';

export default function CallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError(t('player.callbackNoCode'));
      return;
    }

    musicAPI.spotifyAuth.callback(code)
      .then(() => navigate('/'))
      .catch(() => {
        setError(t('player.callbackError'));
      });
  }, []);

  if (error) {
    return (
      <div className="stack-md mt-lg">
        <div className="alert alert--error">{error}</div>
        <button className="btn btn--primary" onClick={() => navigate('/')}>
          ← {t('analyze.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="loading-center">
      <span className="spinner spinner--lg" />
      <span>{t('player.connecting')}</span>
    </div>
  );
}
