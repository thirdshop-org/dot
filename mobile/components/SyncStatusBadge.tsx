import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SyncStatus } from '../types';

interface SyncStatusBadgeProps {
  status: SyncStatus;
  size?: number;
  showLabel?: boolean;
}

const STATUS_CONFIG: Record<SyncStatus, { icon: string; color: string; bg: string; label: string }> = {
  local: { icon: 'phone-android', color: '#757575', bg: '#F5F5F5', label: 'Local' },
  syncing: { icon: 'sync', color: '#FF9800', bg: '#FFF3E0', label: 'Sync...' },
  synced: { icon: 'sync', color: '#4CAF50', bg: '#E8F5E9', label: 'Les deux' },
  cloud: { icon: 'cloud', color: '#1976D2', bg: '#E3F2FD', label: 'Cloud' },
  conflict: { icon: 'warning', color: '#E53935', bg: '#FFEBEE', label: 'Conflit' },
};

export function SyncStatusBadge({ status, size = 16, showLabel }: SyncStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const iconSize = Math.round(size * 0.7);

  if (showLabel) {
    return (
      <View style={[styles.pill, { backgroundColor: config.bg }]}>
        <MaterialIcons name={config.icon as any} size={12} color={config.color} />
        <Text style={[styles.pillText, { color: config.color }]}>{config.label}</Text>
      </View>
    );
  }

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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
