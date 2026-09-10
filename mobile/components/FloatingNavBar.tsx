import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import i18n from "../i18n"
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabKey = 'files' | 'search' | 'settings';

interface TabItem {
  key: TabKey;
  labelKey: string;
  route: string;
  iconActive: keyof typeof Ionicons.glyphMap;
  iconInactive: keyof typeof Ionicons.glyphMap;
}

const TABS: TabItem[] = [
  {
    key: 'files',
    labelKey: 'nav.files', // "Fichiers"
    route: '/',
    iconActive: 'folder',
    iconInactive: 'folder-outline',
  },
  {
    key: 'search',
    labelKey: 'nav.search', // "Recherche"
    route: '/search',
    iconActive: 'search',
    iconInactive: 'search-outline',
  },
  {
    key: 'settings',
    labelKey: 'nav.settings', // "Configuration"
    route: '/settings',
    iconActive: 'settings',
    iconInactive: 'settings-outline',
  },
];

export default function FloatingNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.container}>
        {TABS.map((tab) => {
          const isActive = pathname === tab.route;

          return (
            <Pressable
              key={tab.key}
              style={({ pressed }) => [
                styles.tab,
                pressed && styles.tabPressed,
              ]}
              onPress={() => {
                if (!isActive) {
                  router.push(tab.route as any);
                }
              }}
            >
              <Ionicons
                name={isActive ? tab.iconActive : tab.iconInactive}
                size={22}
                color={isActive ? '#1a73e8' : '#6b7280'}
              />
              <Text
                style={[
                  styles.label,
                  isActive ? styles.labelActive : styles.labelInactive,
                ]}
                numberOfLines={1}
              >
                {i18n.t(tab.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 100,
  },
  container: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 30,
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: '100%',
    maxWidth: 400,
    justifyContent: 'space-around',
    alignItems: 'center',

    // Effet d'ombre / Flottant
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#eaeaea',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabPressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
  },
  labelActive: {
    color: '#1a73e8',
    fontWeight: '700',
  },
  labelInactive: {
    color: '#6b7280',
  },
});