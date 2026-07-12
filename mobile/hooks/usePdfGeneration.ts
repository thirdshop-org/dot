import { useState, useCallback } from 'react';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import { CapturedPhoto } from '../types';

export function usePdfGeneration() {
  const [generating, setGenerating] = useState(false);

  const generatePdf = useCallback(async (photos: CapturedPhoto[]): Promise<string | null> => {
    if (photos.length === 0) return null;

    setGenerating(true);

    try {
      const imagesHtml = photos.map((p) => {
        const ext = p.filePath.split('.').pop()?.toLowerCase() || 'jpeg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        return `<div style="page-break-after: always; display: flex; justify-content: center; align-items: center; height: 100vh;">
          <img src="${p.uri}" style="max-width: 100%; max-height: 100vh; object-fit: contain;" />
        </div>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #fff; }
    @media print {
      @page { margin: 0; }
    }
  </style>
</head>
<body>${imagesHtml}</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html });
      return uri;
    } catch (err) {
      console.error('PDF generation failed:', err);
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  return {
    generatePdf,
    generating,
  };
}
