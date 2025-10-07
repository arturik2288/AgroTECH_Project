import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const { signInWithCode } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const trimmed = code.trim();
    if (trimmed.length < 3) {
      Alert.alert('Ошибка', 'Код должен содержать не менее 3 символов.');
      return;
    }
    setBusy(true);
    try {
      await signInWithCode(trimmed);
      router.replace('/(tabs)/profile');
    } catch (e: any) {
      Alert.alert('Войти не удалось', e?.message ?? 'Проверьте код и интернет.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#efecca', padding: 20, paddingTop: 60 }}>
      <Text style={{ fontSize: 28, fontWeight: '600', marginBottom: 16 }}>Личный код</Text>
      <TextInput
        value={code}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setCode}
        placeholder="Введите код сотрудника"
        style={{
          backgroundColor: 'white',
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontSize: 18,
          borderWidth: 1,
          borderColor: '#ddd',
        }}
      />
      <Pressable
        onPress={onSubmit}
        disabled={busy}
        style={{
          marginTop: 16,
          backgroundColor: '#1f7a1f',
          borderRadius: 12,
          paddingVertical: 14,
          alignItems: 'center',
        }}
      >
        {busy ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontSize: 18 }}>Войти</Text>}
      </Pressable>
    </View>
  );
}
