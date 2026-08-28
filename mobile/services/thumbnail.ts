import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const THUMB_SIZE = 128;

function isGeneratableImage(mimeType: string): boolean {
  return (mimeType ?? '').toLowerCase().startsWith('image/');
}

export async function generateLocalThumbnail(
  uri: string | undefined,
  mimeType: string,
): Promise<string | null> {
  if (!uri || !isGeneratableImage(mimeType)) return null;
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: THUMB_SIZE } }],
      { format: SaveFormat.JPEG, compress: 0.7, base64: true },
    );
    if (!result.base64) return null;
    return `data:image/jpeg;base64,${result.base64}`;
  } catch {
    return null;
  }
}
