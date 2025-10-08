// app/lib/cloud.ts
import { Platform } from 'react-native';
import { supabase } from './supabase';

// === Настройки ===
const BUCKET = 'photos';                   // создайте бакет "photos" в Supabase → Storage
const DEFAULT_SIGN_TTL = 60 * 60 * 24 * 30; // 30 дней

// === Утилиты ===
const extFromUri = (uri: string) => {
  const q = uri.split('?')[0];
  const dot = q.lastIndexOf('.');
  return dot !== -1 ? q.slice(dot + 1).toLowerCase() : 'jpg';
};

const mimeFromExt = (ext: string) =>
  ext === 'png' ? 'image/png' :
  ext === 'webp' ? 'image/webp' :
  ext === 'heic' || ext === 'heif' ? 'image/heic' :
  'image/jpeg';

const rand = (n = 6) =>
  Array.from({ length: n }, () => 'abcdef0123456789'[Math.floor(Math.random() * 16)]).join('');

const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

async function getEmployeeCode(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  const code = (data.user?.user_metadata as any)?.employee_code as string | undefined;
  return code ?? null;
}

// === Публичное API ===
/**
 * Загружает локальный файл-изображение в Supabase Storage и возвращает URL.
 * По умолчанию — signed URL (подпись на 30 дней). Для public-бакета можно включить makePublic.
 */
export async function uploadImageToSupabase(
  fileUri: string,
  opts?: { folder?: string; filename?: string; makePublic?: boolean; expiresIn?: number }
): Promise<string> {
  if (!fileUri) throw new Error('Путь к файлу пустой');

  const ext = extFromUri(fileUri);
  const contentType = mimeFromExt(ext);

  const code = await getEmployeeCode();
  const baseFolder = opts?.folder ?? (code ? `employees/${code}` : 'uploads');
  const filename = opts?.filename ?? `photo_${Date.now()}_${rand(4)}.${ext}`;
  const objectPath = `${baseFolder}/${today()}/${filename}`;

  // Тело файла: RN → объект с { uri, name, type }, Web → Blob
  const body =
    Platform.OS === 'web'
      ? await (await fetch(fileUri)).blob()
      : ({ uri: fileUri, name: filename, type: contentType } as any);

  // Загрузка
  const { error: uploadErr } = await supabase
    .storage
    .from(BUCKET)
    .upload(objectPath, body, { contentType, upsert: false });

  if (uploadErr) {
    throw new Error(uploadErr.message || 'Не удалось загрузить файл в Storage');
  }

  // URL: public или signed
  if (opts?.makePublic) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    return data.publicUrl;
  }

  const ttl = Math.max(60, opts?.expiresIn ?? DEFAULT_SIGN_TTL);
  const { data: signed, error: signErr } =
    await supabase.storage.from(BUCKET).createSignedUrl(objectPath, ttl);

  if (!signErr && signed?.signedUrl) return signed.signedUrl;

  // Фоллбэк: если бакет public — вернём publicUrl
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}
