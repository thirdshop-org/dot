import { useState, useCallback } from 'react';
import * as Print from 'expo-print';

export function usePdfGeneration() {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const generatePdf = useCallback(async (items: { uri: string }[], progressCb?: (pct: number) => void): Promise<string | null> => {
    if (items.length === 0) return null;

    setGenerating(true);
    setProgress(0);
    progressCb?.(0);

    try {
      const imagesHtml = items.map((item) => {
        return `<div style="page-break-after: always; display: flex; justify-content: center; align-items: center; height: 100vh;">
          <img src="${item.uri}" style="max-width: 100%; max-height: 100vh; object-fit: contain;" />
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
      setProgress(100);
      progressCb?.(100);
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
    progress,
  };
}
