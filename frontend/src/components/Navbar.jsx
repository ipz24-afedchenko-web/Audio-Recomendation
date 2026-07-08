import React, { useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useTranslation } from 'react-i18next';
import strings from '../strings';

export default function Navbar() {
  const { user, logout } = useAuth();
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
    localStorage.setItem('app-language', next);
  }, [i18n]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <nav className="navbar" id="main-navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="navbar-brand">
          Music<span>Rec</span>
        </NavLink>

        <button
          className={`hamburger${mobileOpen ? ' hamburger--open' : ''}`}
          onClick={() => setMobileOpen((p) => !p)}
          aria-label="Menu"
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
          <button className="lang-switcher" onClick={toggleLang} title={strings.navbar.switchLanguage}>
            {i18n.language === 'en' ? 'UK' : 'EN'}
          </button>
        </div>
      </div>
    </nav>
  );
}
