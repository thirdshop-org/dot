import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../constants/api';
import { Device as DeviceType } from '../types';

const DEVICE_ID_KEY = 'vaultdrop_device_id';
const DEVICE_NAME_KEY = 'vaultdrop_device_name';
const DEVICE_SERVER_ID_KEY = 'vaultdrop_device_server_id';

function generateDefaultDeviceName(): string {
  const constants = Platform.constants as Record<string, unknown>;
  const brand = String(constants?.Manufacturer ?? '');
  const model = String(constants?.Model ?? '');
  const suffix = Math.random().toString(36).slice(2, 6);
  const base = [brand, model].filter(Boolean).join(' ') || Platform.OS;
  return `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${base} (${suffix})`;
}

async function getOrCreateDeviceId(): Promise<string> {
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export async function getStoredDeviceServerId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_SERVER_ID_KEY);
}

export async function getStoredDeviceName(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_NAME_KEY);
}

export function useDeviceRegistration() {
  const [device, setDevice] = useState<{ localId: string; serverId: string | null; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);

  const register = useCallback(async (deviceName: string) => {
    const localId = await getOrCreateDeviceId();
    const result = await apiClient.post<{ id: string; device_name: string; role: string }>(ENDPOINTS.DEVICES, {
      device_name: deviceName,
    });

    await SecureStore.setItemAsync(DEVICE_SERVER_ID_KEY, result.id);
    await SecureStore.setItemAsync(DEVICE_NAME_KEY, result.device_name);

    setDevice({ localId, serverId: result.id, name: result.device_name });
    setIsRegistered(true);
    return result;
  }, []);

  const checkRegistration = useCallback(async () => {
    try {
      const localId = await getOrCreateDeviceId();
      const storedName = await getStoredDeviceName();

      try {
        const devices = await apiClient.get<DeviceType[]>(ENDPOINTS.DEVICES);
        if (devices.length > 0) {
          const existing = devices[0];
          await SecureStore.setItemAsync(DEVICE_SERVER_ID_KEY, existing.id);
          const name = storedName || existing.device_name;
          setDevice({ localId, serverId: existing.id, name });
          setIsRegistered(true);
          setIsLoading(false);
          return;
        }
      } catch {
        // Not registered yet
      }

      // Auto-register with a generated name instead of blocking
      const autoName = storedName || generateDefaultDeviceName();
      try {
        await register(autoName);
      } catch {
        setDevice({ localId, serverId: null, name: autoName });
        setIsRegistered(false);
      }
    } catch {
      setIsRegistered(false);
    } finally {
      setIsLoading(false);
    }
  }, [register]);

  useEffect(() => {
    checkRegistration();
  }, [checkRegistration]);

  return {
    device,
    isLoading,
    isRegistered,
    register,
    checkRegistration,
  };
}
