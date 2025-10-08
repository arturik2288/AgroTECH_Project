// lib/ai.ts
import { toByteArray } from 'base64-js';
import { Asset } from 'expo-asset';
import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import * as ort from 'onnxruntime-react-native';

let _session: ort.InferenceSession | null = null;

async function loadSession() {
  if (_session) return _session;
  // подгружаем .onnx из ассетов
  const asset = Asset.fromModule(require('../assets/models/finetuned_model.onnx'));
  await asset.downloadAsync(); // гарантирует, что localUri доступен
  _session = await ort.InferenceSession.create(asset.localUri!);
  return _session!;
}

// универсальный ресайз под вход модели, если размер известен в метаданных
function getModelHW(meta?: ort.TensorMetadata): { w: number; h: number } {
  const dims = meta?.dimensions ?? [];
  // ожидаем NCHW: [1, 3, H, W] — если число неизвестно, возьмём 224
  const H = typeof dims[2] === 'number' && dims[2] > 0 ? (dims[2] as number) : 224;
  const W = typeof dims[3] === 'number' && dims[3] > 0 ? (dims[3] as number) : 224;
  return { w: W, h: H };
}

function softmax(x: Float32Array) {
  const m = Math.max(...x);
  const exps = x.map(v => Math.exp(v - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  return Float32Array.from(exps.map(v => v / sum));
}

function topK(arr: Float32Array, k = 3) {
  const idx = [...arr.keys()];
  idx.sort((a, b) => arr[b] - arr[a]);
  return idx.slice(0, k).map(i => ({ index: i, prob: arr[i] }));
}

/**
 * Анализирует картинку по URI (file://...) и возвращает top-K результатов.
 * labels — опциональный массив имён классов (если есть).
 */
export async function analyzeImage(uri: string, labels?: string[]) {
  const session = await loadSession();

  const inputName = session.inputNames[0];
  const inputMeta = session.inputMetadata[inputName];
  const { w, h } = getModelHW(inputMeta);

  // 1) ресайзим на стороне устройства и получаем JPEG base64
  const manip = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: w, height: h } }],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!manip.base64) throw new Error('Не удалось получить base64 изображения');

  // 2) декодируем JPEG -> RGBA пиксели
  const encoded = toByteArray(manip.base64);
  const decoded = jpeg.decode(encoded, { useTArray: true }); // {data: Uint8Array(RGBA...), width, height}
  const rgba = decoded.data; // длина = w*h*4

  // 3) собираем тензор NCHW float32, нормализуем как для ImageNet
  const float = new Float32Array(3 * h * w);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const rgbaIdx = (y * w + x) * 4;
      const r = rgba[rgbaIdx] / 255;
      const g = rgba[rgbaIdx + 1] / 255;
      const b = rgba[rgbaIdx + 2] / 255;

      const idx = y * w + x;
      float[0 * h * w + idx] = (r - mean[0]) / std[0];
      float[1 * h * w + idx] = (g - mean[1]) / std[1];
      float[2 * h * w + idx] = (b - mean[2]) / std[2];
    }
  }

  const inputTensor = new ort.Tensor('float32', float, [1, 3, h, w]);
  const feeds: Record<string, ort.Tensor> = { [inputName]: inputTensor };

  const outMap = await session.run(feeds);
  const firstOutName = session.outputNames[0];
  const output = outMap[firstOutName] as ort.Tensor;

  // приводим к 1D
  const logits = output.data as Float32Array | number[];
  const vec = logits instanceof Float32Array ? logits : Float32Array.from(logits as number[]);
  const probs = softmax(vec);
  const tops = topK(probs, 3).map(t => ({
    ...t,
    label: labels?.[t.index] ?? `class_${t.index}`,
  }));

  return { width: w, height: h, inputName, outputName: firstOutName, top3: tops };
}
