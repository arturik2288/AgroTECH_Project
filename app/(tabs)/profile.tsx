import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';


export default function ProfileScreen() {
  const { employee, signOut } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: '#efecca', padding: 20, paddingTop: 60 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', marginBottom: 8 }}>Личный кабинет</Text>
      {employee ? (
        <>
          <Text style={{ fontSize: 18, marginTop: 8 }}>Код: {employee.code}</Text>
          <Text style={{ fontSize: 18, marginTop: 4 }}>Имя: {employee.full_name ?? '—'}</Text>
          <Text style={{ fontSize: 18, marginTop: 4 }}>Роль: {employee.role ?? '—'}</Text>
        </>
      ) : (
        <Text style={{ fontSize: 18, marginTop: 8 }}>Данных нет</Text>
      )}

      <Pressable
        onPress={async () => {
          await signOut();
          router.replace('/login');
        }}
        style={{
          marginTop: 24,
          backgroundColor: '#2f3a4f',
          borderRadius: 12,
          paddingVertical: 14,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: 'white', fontSize: 18 }}>Выйти</Text>
      </Pressable>
    </View>
  );
}
