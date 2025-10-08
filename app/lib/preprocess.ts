// lib/preprocess.ts
import { decode as atob } from 'base-64';
import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';

export type PreprocessOpts = {
  width: number;     // подставь реальный вход твоей модели
  height: number;
  mean?: [number, number, number];
  std?: [number, number, number];
  nchw?: boolean;    // true → [1,3,H,W], false → [1,H,W,3]
};

function b64ToU8(b64: string) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export async function imageUriToTensor(uri: string, opts: PreprocessOpts) {
  const {
    width, height,
    mean = [0.485, 0.456, 0.406],
    std  = [0.229, 0.224, 0.225],
    nchw = true
  } = opts;

  const m = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width, height } }],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!m.base64) throw new Error('Не удалось получить base64');

  const raw = jpeg.decode(b64ToU8(m.base64), { useTArray: true });
  const rgba = raw.data; // Uint8Array RGBA
  const size = width * height;

  // нормализация в float32
  const chn = new Float32Array(3 * size);
  for (let i = 0, p = 0; i < size; i++, p += 4) {
    const r = rgba[p] / 255;
    const g = rgba[p + 1] / 255;
    const b = rgba[p + 2] / 255;
    chn[i]             = (r - mean[0]) / std[0];
    chn[size + i]      = (g - mean[1]) / std[1];
    chn[2 * size + i]  = (b - mean[2]) / std[2];
  }

  if (nchw) return { tensor: chn, shape: [1, 3, height, width] as number[] };

  // NHWC упаковка
  const nhwc = new Float32Array(3 * size);
  for (let i = 0; i < size; i++) {
    nhwc[3 * i]     = chn[i];
    nhwc[3 * i + 1] = chn[size + i];
    nhwc[3 * i + 2] = chn[2 * size + i];
  }
  return { tensor: nhwc, shape: [1, height, width, 3] as number[] };
}
