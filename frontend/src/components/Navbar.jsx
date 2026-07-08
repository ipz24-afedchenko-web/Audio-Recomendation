import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import strings from '../strings';

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
                  Upload
                  <span className="nav-dropdown-arrow">▾</span>
                </NavLink>

                {uploadOpen && (
                  <div className="nav-dropdown-menu">
                    <NavLink
                      to="/upload"
                      className="nav-dropdown-item"
                      onClick={() => setUploadOpen(false)}
                    >
                      🎵 {strings.nav.uploadSingle}
                    </NavLink>
                    <NavLink
                      to="/bulk-upload"
                      className="nav-dropdown-item"
                      onClick={() => setUploadOpen(false)}
                    >
                      📂 {strings.nav.uploadBulk}
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
