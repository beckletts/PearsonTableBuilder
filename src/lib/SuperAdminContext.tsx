import { createContext, useContext } from 'react';

export const SuperAdminContext = createContext(false);

export function useSuperAdmin(): boolean {
  return useContext(SuperAdminContext);
}
