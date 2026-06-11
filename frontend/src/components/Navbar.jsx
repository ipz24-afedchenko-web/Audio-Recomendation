import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
              <NavLink to="/upload">Upload</NavLink>
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
