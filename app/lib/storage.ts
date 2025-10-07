// lib/storage.ts
import * as SecureStore from 'expo-secure-store';

const KEY = 'seedscan_employee_code';

export async function saveEmployeeCode(code: string) {
  await SecureStore.setItemAsync(KEY, code);
}

export async function getEmployeeCode() {
  return SecureStore.getItemAsync(KEY);
}

export async function clearEmployeeCode() {
  await SecureStore.deleteItemAsync(KEY);
}
