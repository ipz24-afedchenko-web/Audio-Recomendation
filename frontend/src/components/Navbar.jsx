import React, { useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useTheme } from '../utils/ThemeContext';
import { useTranslation } from 'react-i18next';
import strings from '../strings';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleLang = useCallback(() => {
    const next = i18n.language === 'en' ? 'uk' : 'en';
    i18n.changeLanguage(next);
    try {
      localStorage.setItem('app-language', next);
    } catch {
      /* ignore */
    }
  }, [i18n]);

  const langLabel = i18n.language === 'uk' ? strings.common.langUA : strings.common.langEN;
  const closeMobile = () => setMobileOpen(false);

  return (
    <nav className="navbar" id="main-navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="navbar-brand">
          <span className="brand-mark" aria-hidden="true">♪</span>
          Music<span>Rec</span>
        </NavLink>

        <button
          className={`hamburger${mobileOpen ? ' hamburger--open' : ''}`}
          onClick={() => setMobileOpen((p) => !p)}
          aria-label="Menu"
          aria-expanded={mobileOpen}
        >
          <span /><span /><span />
        </button>

        <div className={`navbar-links${mobileOpen ? ' navbar-links--open' : ''}`}>
          {user ? (
            <>
              <NavLink to="/" end onClick={closeMobile}>{strings.navbar.dashboard}</NavLink>

              <div className="nav-dropdown-wrapper"
                onMouseEnter={() => setUploadOpen(true)}
                onMouseLeave={() => setUploadOpen(false)}
              >
                <NavLink
                  to="/upload"
                  className={({ isActive }) =>
                    `nav-dropdown-trigger${isActive ? ' active' : ''}`
                  }
                >
                  {strings.navbar.upload}
                  <span className="nav-dropdown-arrow">▾</span>
                </NavLink>

                {(uploadOpen || mobileOpen) && (
                  <div className={`nav-dropdown-menu${mobileOpen ? ' nav-dropdown-menu--mobile' : ''}`}>
                    <NavLink
                      to="/upload"
                      className="nav-dropdown-item"
                      onClick={() => { setUploadOpen(false); closeMobile(); }}
                    >
                      {strings.nav.uploadSingle}
                    </NavLink>
                    <NavLink
                      to="/bulk-upload"
                      className="nav-dropdown-item"
                      onClick={() => { setUploadOpen(false); closeMobile(); }}
                    >
                      {strings.nav.uploadBulk}
                    </NavLink>
                  </div>
                )}
              </div>

              <NavLink to="/recommendations" onClick={closeMobile}>{strings.navbar.recommend}</NavLink>
              {user.is_superuser && (
                <NavLink to="/admin" onClick={closeMobile}>{strings.navbar.admin}</NavLink>
              )}
              <span className="navbar-user">{user.username}</span>
              <button onClick={handleLogout} id="logout-btn">{strings.navbar.logout}</button>
            </>
          ) : (
            <>
              <NavLink to="/login" onClick={closeMobile}>{strings.navbar.login}</NavLink>
              <NavLink to="/register" onClick={closeMobile}>{strings.navbar.register}</NavLink>
            </>
          )}

          <div className="header-controls">
            <button
              className="lang-switcher"
              onClick={toggleLang}
              title={strings.navbar.language}
              aria-label={strings.navbar.language}
            >
              {langLabel}
            </button>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? strings.navbar.themeToLight : strings.navbar.themeToDark}
              aria-label={theme === 'dark' ? strings.navbar.themeToLight : strings.navbar.themeToDark}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
