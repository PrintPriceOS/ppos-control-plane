import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '../lib/authStore';

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuth = isAuthenticated();
  const location = useLocation();

  if (!isAuth) {
    if (location.pathname.startsWith('/developers') || location.pathname.startsWith('/api-keys')) {
      return <>{children}</>;
    }
    // Redirect to login if no token is present, saving the current location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
