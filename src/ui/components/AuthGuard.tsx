import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAdminKey } from '../lib/adminApi';

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const key = getAdminKey();
  const location = useLocation();

  if (!key) {
    // Redirect to login if no key is present, saving the current location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
