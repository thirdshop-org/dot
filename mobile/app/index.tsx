import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { pickDirectory } from '../services/safDirectory';
import { useEffect } from 'react';
import { saveDirectory } from '../services/localStorage';

export default function Index() {

  useEffect(()=>{
    pickDirectory().then((value) => {
      if ( !value ) return;
      saveDirectory(value)
    })
  },[])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dot.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
  },
});