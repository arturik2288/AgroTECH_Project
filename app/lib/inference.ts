// app/lib/inference.ts
import { Asset } from 'expo-asset';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';

let _sessionPromise: Promise<InferenceSession> | null = null;

async function loadSession(): Promise<InferenceSession> {
  // правильный путь: из app/lib -> вверх в корень -> models
  // @ts-ignore — Metro-ассет, TypeScript не знает про .onnx
  // @ts-ignore
  const asset = Asset.fromModule(require('../../assets/model/finetuned_model.onnx'));


  await asset.downloadAsync();                   // офлайн-локализация
  const res = await fetch(asset.localUri!);      // читаем как файл://
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);

  return InferenceSession.create(bytes);
}

export async function getSession() {
  if (!_sessionPromise) _sessionPromise = loadSession();
  return _sessionPromise;
}

export async function runOnnx(inputData: Float32Array, shape: number[]) {
  const session = await getSession();
  const inputName = session.inputNames[0];
  const feeds = { [inputName]: new Tensor('float32', inputData, shape) };
  const outputs = await session.run(feeds);
  const outName = session.outputNames[0];
  return outputs[outName].data as Float32Array;
}
