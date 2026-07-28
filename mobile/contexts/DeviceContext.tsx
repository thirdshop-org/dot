import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDeviceRegistration } from '../hooks/useDeviceRegistration';
import { useAuth } from './AuthContext';

interface DeviceContextType {
  isRegistered: boolean | null;
  isLoading: boolean;
  deviceName: string;
  register: (name: string) => Promise<{ id: string; device_name: string; role: string }>;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const registration = useDeviceRegistration();
  const { isRegistered, isLoading, device, register } = registration;

  const value: DeviceContextType = user
    ? {
        isRegistered,
        isLoading,
        deviceName: device?.name ?? '',
        register,
      }
    : {
        isRegistered: null,
        isLoading: false,
        deviceName: '',
        register: async () => { throw new Error('Not authenticated'); },
      };

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevice must be used within a DeviceProvider');
  }
  return context;
}
