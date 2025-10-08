// Нужно: expo-image-picker, expo-media-library, expo-file-system
import { Directory, File, Paths } from "expo-file-system"; // новый API SDK 54
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { useRef, useState } from "react";
import { Alert, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { analyzeImage } from "../lib/ai";
import { uploadImageToSupabase } from "../lib/cloud";

type PickOk = { ok: true; uri: string; savedPath: string };
type PickFail = { ok: false; reason: string; message?: string };
type PickResult = PickOk | PickFail;

const mimeFromExt = (ext: string) =>
  ext === "png" ? "image/png" :
  ext === "webp" ? "image/webp" :
  ext === "heic" || ext === "heif" ? "image/heic" :
  "image/jpeg";

export default function CameraExpoScreen() {
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [cloudUrl, setCloudUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const onceRef = useRef(false);

  // ---- Permissions ----
  const ensureCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === "granted";
  };
  // В Expo Go на Android не просим write-права (см. предыдущие правки)
  const ensureLibraryPermission = async (write = false) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return false;
    if (write && Platform.OS === "ios") {
      const writePerm = await MediaLibrary.requestPermissionsAsync();
      return writePerm.status === "granted";
    }
    return true;
  };

  const getExt = (uri: string) => {
    const q = uri.split("?")[0];
    const dot = q.lastIndexOf(".");
    return dot !== -1 ? q.slice(dot + 1).toLowerCase() : "jpg";
  };

  // ---- Save to app sandbox (new FS API) ----
  const saveToAppStorage = async (uri: string) => {
    const ext = getExt(uri);
    const fileName = `photo_${Date.now()}.${ext}`;

    const photosDir = new Directory(Paths.document, "photos");
    await photosDir.create({ idempotent: true, intermediates: true });

    const src = new File(uri);
    const dst = new File(photosDir, fileName);
    await src.copy(dst);
    return dst.uri;
  };

const handleCloudUpload = async () => {
  if (!savedPath) {
    Alert.alert("Сначала выберите/сделайте фото");
    return;
  }
  try {
    setUploading(true);
    setCloudUrl(null);

    // ⬇️ вот эта строка — загрузка в Supabase
    const url = await uploadImageToSupabase(savedPath);

    setCloudUrl(url);
    Alert.alert("Загружено", "Фото сохранено в облаке");
  } catch (e: any) {
    Alert.alert("Не удалось загрузить", e?.message || "Ошибка сети");
  } finally {
    setUploading(false);
  }
};

  // ---- Camera / Library flows ----
  const handleCamera = async (): Promise<PickResult> => {
    if (busy || onceRef.current) return { ok: false, reason: "BUSY" };
    setBusy(true);
    onceRef.current = true;
    try {
      const ok = await ensureCameraPermission();
      if (!ok) {
        Alert.alert("Нет доступа к камере");
        return { ok: false, reason: "PERMISSION" };
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        allowsEditing: false,
        exif: false,
        base64: false,
      });
      if (result.canceled) return { ok: false, reason: "CANCEL" };
      const asset = result.assets?.[0];
      if (!asset?.uri) return { ok: false, reason: "NO_ASSET" };
      const saved = await saveToAppStorage(asset.uri);
      return { ok: true, uri: asset.uri, savedPath: saved };
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось сделать фото");
      return { ok: false, reason: "EXCEPTION", message: String(e) };
    } finally {
      setBusy(false);
      setTimeout(() => (onceRef.current = false), 350);
    }
  };

  const handleLibrary = async (): Promise<PickResult> => {
    if (busy || onceRef.current) return { ok: false, reason: "BUSY" };
    setBusy(true);
    onceRef.current = true;
    try {
      const ok = await ensureLibraryPermission();
      if (!ok) {
        Alert.alert("Нет доступа к библиотеке фотографий");
        return { ok: false, reason: "PERMISSION" };
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsMultipleSelection: false,
        base64: false,
      });
      if (result.canceled) return { ok: false, reason: "CANCEL" };
      const asset = result.assets?.[0];
      if (!asset?.uri) return { ok: false, reason: "NO_ASSET" };
      const saved = await saveToAppStorage(asset.uri);
      return { ok: true, uri: asset.uri, savedPath: saved };
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось открыть галерею");
      return { ok: false, reason: "EXCEPTION", message: String(e) };
    } finally {
      setBusy(false);
      setTimeout(() => (onceRef.current = false), 350);
    }
  };

  const onTake = async () => {
    const r = await handleCamera();
    if (r.ok) {
      setSavedPath(r.savedPath);
      setPreviewUri(r.savedPath);
      setCloudUrl(null);
    }
  };

  const onPick = async () => {
    const r = await handleLibrary();
    if (r.ok) {
      setSavedPath(r.savedPath);
      setPreviewUri(r.savedPath);
      setCloudUrl(null);
    }
  };

const runAnalysis = async () => {
  if (!savedPath) {
    Alert.alert("Сначала выберите/сделайте фото");
   return;
  }
  try {
    setAnalyzing(true);
    setAnalysis(null);
    const result = await analyzeImage(savedPath /*, labels? */);
    const lines = result.top3.map(
      (t, i) => `${i + 1}) ${t.label} — ${(t.prob * 100).toFixed(1)}% (id=${t.index})`
    );
    setAnalysis(lines.join("\n"));
  } catch (e: any) {
    Alert.alert("Ошибка анализа", e?.message ?? "Не удалось выполнить инференс");
  } finally {
    setAnalyzing(false);
  }
};

  // ---- UI ----
  return (
    <View style={s.container}>
      <Text style={s.title}>Камера (Expo)</Text>
      <Text style={s.subtitle}>
        Сделайте фото или выберите из галереи. Копия сохраняется в памяти приложения.
      </Text>

      <View style={s.row}>
        <TouchableOpacity style={[s.btn, busy && s.btnDisabled]} onPress={onTake} disabled={busy}>
          <Text style={s.btnText}>{busy ? "Подождите…" : "Сделать фото"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, busy && s.btnDisabled]} onPress={onPick} disabled={busy}>
          <Text style={s.btnText}>{busy ? "Подождите…" : "Из галереи"}</Text>
        </TouchableOpacity>
      </View>

      {previewUri ? (
        <Image source={{ uri: previewUri }} style={s.preview} />
      ) : (
        <View style={s.placeholder}>
          <Text style={s.placeholderText}>Фото пока не выбрано</Text>
        </View>
      )}

      <Text style={s.path} numberOfLines={2}>
        {savedPath ? `Сохранено: ${savedPath}` : "—"}
      </Text>
      
    <TouchableOpacity style={[s.btn, s.secondary]} onPress={runAnalysis} disabled={!savedPath || busy || analyzing}>
      <Text style={s.btnText}>{analyzing ? "Анализ…" : "Анализировать"}</Text>
    </TouchableOpacity>

      <TouchableOpacity
        style={[s.btn, s.accent, (!savedPath || uploading) && s.btnDisabled]}
        onPress={handleCloudUpload}
        disabled={!savedPath || uploading}
      >
        <Text style={s.btnText}>{uploading ? "Загрузка…" : "Загрузить в облако"}</Text>
      </TouchableOpacity>

      {!!cloudUrl && (
        <Text style={[s.path, { marginTop: 6 }]}>
          Облако: {cloudUrl}
        </Text>
      )}

      {Platform.OS === "web" && (
        <Text style={{ marginTop: 10, color: "#666" }}>
          Примечание: на Web доступ к галерее/камере зависит от браузера.
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ecead1", padding: 16 },
  title: { fontSize: 22, fontWeight: "600", marginBottom: 4 },
  subtitle: { color: "#545454", marginBottom: 12 },
  row: { flexDirection: "row", gap: 12, marginBottom: 12 },
  btn: {
    flex: 1,
    backgroundColor: "#2b6cb0",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "white", fontWeight: "600" },
  preview: { width: "100%", height: 240, borderRadius: 12, backgroundColor: "#eee" },
  placeholder: {
    width: "100%",
    height: 240,
    borderRadius: 12,
    backgroundColor: "#e1dec7",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: "#6b6b6b" },
  path: { marginTop: 10, color: "#333" },
  secondary: { backgroundColor: "#4a5568", marginTop: 10 },
  accent: { backgroundColor: "#0ea5e9", marginTop: 10 },
});
