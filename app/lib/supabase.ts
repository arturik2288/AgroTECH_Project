// lib/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jowrteicjuyqwwifpubz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impvd3J0ZWljanV5cXd3aWZwdWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3ODY4NDMsImV4cCI6MjA3NTM2Mjg0M30.jUTMxovMyzof4DegGVGpFVyQeKpOL6IO-TPJjuw0d5I';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export default supabase;
