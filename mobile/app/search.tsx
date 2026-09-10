import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import FloatingNavBar from '../components/FloatingNavBar';
import i18n from '../i18n';

export default function Search() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: i18n.t('search') }} />
      <StatusBar style="auto" />
      <FloatingNavBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});