import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar" id="main-navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="navbar-brand">
          🎵 Music<span>Rec</span>
        </NavLink>

        <div className="navbar-links">
          {user ? (
            <>
              <NavLink to="/" end>Dashboard</NavLink>

              {/* Upload dropdown */}
              <div
                style={{ position: 'relative' }}
                onMouseEnter={() => setUploadOpen(true)}
                onMouseLeave={() => setUploadOpen(false)}
              >
                <NavLink
                  to="/upload"
                  style={({ isActive }) => ({
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: 'var(--space-sm) var(--space-md)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-size-sm)', fontWeight: 500,
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    background: isActive ? 'var(--accent-subtle)' : 'none',
                    transition: 'all 150ms ease', cursor: 'pointer',
                    textDecoration: 'none',
                  })}
                >
                  Upload
                  <span style={{ fontSize: '0.6rem', opacity: 0.6, marginTop: 1 }}>▾</span>
                </NavLink>

                {uploadOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '6px 0', minWidth: 180,
                    boxShadow: 'var(--shadow-lg)', zIndex: 200,
                    animation: 'fadeIn 0.15s ease',
                  }}>
                    <NavLink
                      to="/upload"
                      onClick={() => setUploadOpen(false)}
                      style={{ display: 'block', padding: '8px 16px', fontSize: '0.85rem',
                        color: 'var(--text-secondary)', transition: 'all 0.15s ease' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-subtle)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                      🎵 Один трек
                    </NavLink>
                    <NavLink
                      to="/bulk-upload"
                      onClick={() => setUploadOpen(false)}
                      style={{ display: 'block', padding: '8px 16px', fontSize: '0.85rem',
                        color: 'var(--text-secondary)', transition: 'all 0.15s ease' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-subtle)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                      📂 Масове завантаження
                    </NavLink>
                  </div>
                )}
              </div>

              <NavLink to="/recommendations">Recommend</NavLink>
              <span className="navbar-user">{user.username}</span>
              <button onClick={handleLogout} id="logout-btn">Logout</button>
            </>
          ) : (
            <>
              <NavLink to="/login">Login</NavLink>
              <NavLink to="/register">Register</NavLink>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
