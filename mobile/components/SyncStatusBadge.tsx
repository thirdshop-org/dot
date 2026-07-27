import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SyncStatus } from '../types';

interface SyncStatusBadgeProps {
  status: SyncStatus;
  size?: number;
}

const STATUS_CONFIG: Record<SyncStatus, { icon: string; color: string; bg: string }> = {
  local: { icon: 'phone-android', color: '#757575', bg: 'rgba(245,245,245,0.9)' },
  syncing: { icon: 'sync', color: '#FF9800', bg: 'rgba(255,243,224,0.9)' },
  synced: { icon: 'sync', color: '#4CAF50', bg: 'rgba(232,245,233,0.9)' },
  cloud: { icon: 'cloud', color: '#1976D2', bg: 'rgba(227,242,253,0.9)' },
  conflict: { icon: 'warning', color: '#E53935', bg: 'rgba(255,235,238,0.9)' },
};

export function SyncStatusBadge({ status, size = 16 }: SyncStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const iconSize = Math.round(size * 0.7);

  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: config.bg }]}>
      <MaterialIcons name={config.icon as any} size={iconSize} color={config.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.1)',
  },
});
