import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import i18n from '../i18n';

export default function Login() {
  const router = useRouter();
  const { signIn, user, continueWithoutAccount } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError(i18n.t('login_error_required'));
      return;
    }
    setSubmitting(true);
    setError(null);

    // Changer de compte en étant connecté remplace la session locale (garde-fou).
    if (user) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(i18n.t('login_switch_title'), i18n.t('login_switch_message'), [
          { text: i18n.t('login_switch_cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: i18n.t('login_switch_confirm'), style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) {
        setSubmitting(false);
        return;
      }
    }

    try {
      await signIn(username.trim(), password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : i18n.t('login_error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{i18n.t('login_subtitle')}</Text>
      <TextInput
        style={styles.input}
        placeholder={i18n.t('login_username')}
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder={i18n.t('login_password')}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? i18n.t('login_submitting') : i18n.t('login_submit')}
        </Text>
      </Pressable>
      <Pressable
        style={styles.skipButton}
        onPress={() => {
          continueWithoutAccount();
          router.replace('/');
        }}
      >
        <Text style={styles.skipButtonText}>{i18n.t('login_skip')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  error: {
    color: '#c5221f',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#1a73e8',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  skipButtonText: {
    color: '#1a73e8',
    fontSize: 15,
    fontWeight: '500',
  },
});