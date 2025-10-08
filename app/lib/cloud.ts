// app/lib/cloud.ts
import { Platform } from 'react-native';
import { getEmployeeCode } from './storage';
import { supabase } from './supabase';

const BUCKET = 'photos';
const DEFAULT_SIGN_TTL = 60 * 60 * 24 * 30;

const extFromUri = (uri: string) => {
  const q = uri.split('?')[0];
  const i = q.lastIndexOf('.');
  return i !== -1 ? q.slice(i + 1).toLowerCase() : 'jpg';
};

const mimeFromExt = (ext: string) =>
  ext === 'png' ? 'image/png' :
  ext === 'webp' ? 'image/webp' :
  ext === 'heic' || ext === 'heif' ? 'image/heic' :
  'image/jpeg';

const today = () => new Date().toISOString().slice(0, 10);
const rand = () => Math.random().toString(36).slice(2, 8);

type UploadOpts = {
  bucket?: string;
  folder?: string;
  filename?: string;
  public?: boolean;
  expiresIn?: number;
};

/** Универсальная загрузка для Expo/React Native и Web */
export async function uploadImageToSupabase(uri: string, opts?: UploadOpts): Promise<string> {
  const bucket = opts?.bucket ?? BUCKET;
  const ext = extFromUri(uri);
  const contentType = mimeFromExt(ext);

  const code =
    (await getEmployeeCode()) ??
    (await supabase.auth.getUser()).data.user?.user_metadata?.employee_code ??
    'unknown';

  const baseFolder = opts?.folder ?? `employees/${code}`;
  const filename = opts?.filename ?? `photo_${Date.now()}_${rand()}.${ext}`;
  const objectPath = `${baseFolder}/${today()}/${filename}`;

  const body: any =
    Platform.OS === 'web'
      ? await (await fetch(uri)).blob()                    // Web → Blob
      : { uri, name: filename, type: contentType };        // iOS/Android → { uri, name, type }

  const { error } = await supabase
    .storage
    .from(bucket)
    .upload(objectPath, body, { contentType, upsert: false });

  if (error) throw new Error(error.message);

  if (opts?.public) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return data.publicUrl;
  } else {
    const ttl = Math.max(60, opts?.expiresIn ?? DEFAULT_SIGN_TTL);
    const { data: signed } =
      await supabase.storage.from(bucket).createSignedUrl(objectPath, ttl);
    return signed?.signedUrl
      ?? supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
  }
}
