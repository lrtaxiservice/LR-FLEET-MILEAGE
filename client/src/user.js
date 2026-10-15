import { createContext, useContext } from 'react';

export const UserCtx = createContext(null);
export const useUser = () => useContext(UserCtx);
