import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './utils/AuthContext';
import { ThemeProvider } from './utils/ThemeContext';
import { PlayerProvider } from './context/PlayerContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import GlobalPlayer from './components/GlobalPlayer';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import BulkUploadPage from './pages/BulkUploadPage';
import AnalyzePage from './pages/AnalyzePage';
import RecommendationsPage from './pages/RecommendationsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import CallbackPage from './pages/CallbackPage';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <PlayerProvider>
            <div className="app-shell">
              <div className="app-bg" aria-hidden="true" />
              <Navbar />
              <main className="app-main">
                <Routes>
                  {/* Public */}
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/callback" element={<CallbackPage />} />

                  {/* Protected */}
                  <Route
                    path="/"
                    element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
                  />
                  <Route
                    path="/upload"
                    element={<ProtectedRoute><UploadPage /></ProtectedRoute>}
                  />
                  <Route
                    path="/bulk-upload"
                    element={<ProtectedRoute><BulkUploadPage /></ProtectedRoute>}
                  />
                  <Route
                    path="/analyze/:musicId"
                    element={<ProtectedRoute><AnalyzePage /></ProtectedRoute>}
                  />
                  <Route
                    path="/recommendations"
                    element={<ProtectedRoute><RecommendationsPage /></ProtectedRoute>}
                  />
                  <Route
                    path="/admin"
                    element={<ProtectedRoute><AdminDashboardPage /></ProtectedRoute>}
                  />
                </Routes>
              </main>
            </div>
            <GlobalPlayer />
          </PlayerProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
