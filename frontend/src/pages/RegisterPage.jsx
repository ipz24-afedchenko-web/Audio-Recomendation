import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../utils/AuthContext';
import strings from '../strings';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  useTranslation();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(strings.register.passwordMin);
      return;
    }

    setLoading(true);
    try {
      await register(username, email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || strings.auth.register.submit);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card card">
        <h1 className="auth-title">{strings.auth.register.welcome}</h1>
        <p className="auth-subtitle">{strings.auth.register.subtitle}</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-username">{strings.auth.register.username}</label>
            <input
              id="reg-username"
              className="form-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={strings.auth.register.placeholderUsername}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">{strings.auth.register.email}</label>
            <input
              id="reg-email"
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={strings.auth.register.placeholderEmail}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">{strings.auth.register.password}</label>
            <input
              id="reg-password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={strings.auth.register.placeholderPassword}
              required
              minLength={8}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
            id="register-submit"
          >
            {loading ? <><div className="spinner" /> {strings.auth.register.creating}</> : strings.auth.register.submit}
          </button>
        </form>

        <p className="auth-footer">
          {strings.auth.register.haveAccount} <Link to="/login">{strings.auth.register.signIn}</Link>
        </p>
      </div>
    </div>
  );
}
