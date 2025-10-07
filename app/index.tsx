import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function Index() {
  const { loading, employee } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (employee) router.replace('/(tabs)/camera');
      else router.replace('/login');
    }
  }, [loading, employee]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
