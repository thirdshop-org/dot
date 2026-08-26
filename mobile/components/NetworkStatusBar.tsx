import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export function NetworkStatusBar() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) {
    return (
      <View style={styles.container}>
        <View style={styles.dotOnline} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.offlineBadge}>
        <MaterialIcons name="cloud-off" size={14} color="#fff" />
        <Text style={styles.offlineText}>Offline</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: 4,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOnline: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E53935',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  offlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
});
