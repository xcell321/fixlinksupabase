// Multipart upload helpers shared by repair submit, registration,
// customer profile and portfolio uploads. Previously copied 4x in api.tsx.
import { Platform } from 'react-native';

export type Coords = { latitude?: number; longitude?: number };

export type PickedFile = {
  uri?: string;
  file?: unknown;
  name?: string;
  fileName?: string;
  mimeType?: string;
  type?: string;
};

// Builds the file value appended to FormData on every platform.
// Native uses the { uri, name, type } shape handled by the networking layer.
// Web needs a real File or Blob, so a blob or data URI is fetched first and
// wrapped as a File. Without this the browser sends the text "[object Object]",
// the backend receives no file, and register wrongly reports missing files
// even though the user attached them.
export const buildUploadFile = async (
  info: PickedFile,
  fallbackName: string,
  fallbackType: string,
): Promise<Blob | { uri: string; name: string; type: string }> => {
  const name = info.fileName ?? info.name ?? fallbackName;
  const type = info.mimeType ?? info.type ?? fallbackType;
  if (info.file instanceof Blob) {
    return new File([info.file], name, { type });
  }
  if (Platform.OS === 'web' && info.uri && /^(blob:|data:)/i.test(info.uri)) {
    const blob = await (await fetch(info.uri)).blob();
    return new File([blob], name, { type: blob.type || type });
  }
  return { uri: String(info.uri ?? ''), name, type };
};

export const getMimeType = (file: { mimeType?: string; name?: string }): string => {
  if (file.mimeType) return file.mimeType;
  const extension = file.name?.split('.').pop()?.toLowerCase();
  return extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg';
};

export const appendUploadFile = async (
  formData: FormData,
  key: string,
  file: PickedFile | undefined,
  fallbackName: string,
  fallbackType: string,
): Promise<void> => {
  if (!file?.uri) return;
  formData.append(key, (await buildUploadFile(file, fallbackName, fallbackType)) as unknown as Blob);
};
