import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../utils/AuthContext';
import strings from '../strings';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  useTranslation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || strings.auth.login.submit);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card card">
        <h1 className="auth-title">{strings.auth.login.welcome}</h1>
        <p className="auth-subtitle">{strings.auth.login.subtitle}</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-username">{strings.auth.login.username}</label>
            <input
              id="login-username"
              className="form-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={strings.auth.login.placeholderUsername}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">{strings.auth.login.password}</label>
            <input
              id="login-password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={strings.auth.login.placeholderPassword}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
            id="login-submit"
          >
            {loading ? <><div className="spinner" /> {strings.auth.login.signingIn}</> : strings.auth.login.submit}
          </button>
        </form>

        <p className="auth-footer">
          {strings.auth.login.noAccount} <Link to="/register">{strings.auth.login.createOne}</Link>
        </p>
      </div>
    </div>
  );
}
