import { useEffect, useState, useCallback, useRef } from 'react';
import { useCameraDevice, useCameraPermission, usePhotoOutput, type TorchMode, type CameraRef } from 'react-native-vision-camera';
import { useUpload } from './useUpload';
import { CapturedPhoto } from '../types';

type CaptureStatus = 'idle' | 'capturing' | 'uploading' | 'success' | 'error';

export function useCameraCapture() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cameraRef = useRef<CameraRef>(null);

  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>('idle');
  const [captureError, setCaptureError] = useState<string>();
  const [torchMode, setTorchMode] = useState<TorchMode>('off');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);

  const upload = useUpload();

  const photoOutput = usePhotoOutput();

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const isActive = hasPermission && !!device && captureStatus !== 'uploading';

  const toggleTorch = useCallback(async () => {
    const next = torchMode === 'off' ? 'on' : 'off';
    setTorchMode(next);
    if (cameraReady && cameraRef.current) {
      try {
        const controller = cameraRef.current.controller;
        if (controller?.device.hasTorch) {
          await controller.setTorchMode(next);
        }
      } catch {
        setTorchMode(torchMode);
      }
    }
  }, [torchMode, cameraReady]);

  const onStarted = useCallback(() => {
    setCameraReady(true);
    if (torchMode === 'on' && cameraRef.current) {
      const controller = cameraRef.current.controller;
      controller?.setTorchMode('on').catch(() => {});
    }
  }, [torchMode]);

  const onStopped = useCallback(() => {
    setCameraReady(false);
  }, []);

  const addCapturedPhoto = useCallback((photo: CapturedPhoto) => {
    setCapturedPhotos((prev) => [...prev, photo]);
  }, []);

  const removeCapturedPhoto = useCallback((id: string) => {
    setCapturedPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearCapturedPhotos = useCallback(() => {
    setCapturedPhotos([]);
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!photoOutput) return;

    const photoId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    try {
      setCaptureStatus('capturing');
      setCaptureError(undefined);

      const { filePath } = await photoOutput.capturePhotoToFile({}, {});

      setCaptureStatus('uploading');

      const capturedPhoto: CapturedPhoto = {
        id: photoId,
        filePath,
        uri: 'file://' + filePath,
      };

      addCapturedPhoto(capturedPhoto);

      const result = await upload.mutateAsync([
        { uri: capturedPhoto.uri, type: 'image/jpeg', name: `scan_${photoId}.jpg` },
      ]);

      if (result.errors.length > 0) {
        setCaptureStatus('error');
        setCaptureError(result.errors[0].message);
      } else {
        capturedPhoto.uploadedId = result.uploaded[0]?.id;
        capturedPhoto.uploadedAt = new Date().toISOString();
        setCaptureStatus('success');
      }
    } catch (err) {
      setCaptureStatus('error');
      setCaptureError(err instanceof Error ? err.message : 'Erreur lors de la capture');
    }

    setTimeout(() => {
      setCaptureStatus('idle');
      setCaptureError(undefined);
    }, 1500);
  }, [photoOutput, upload, addCapturedPhoto]);

  return {
    cameraRef,
    hasPermission,
    requestPermission,
    device,
    photoOutput,
    capturePhoto,
    captureStatus,
    captureError,
    isActive,
    torchMode,
    toggleTorch,
    onStarted,
    onStopped,
    capturedPhotos,
    removeCapturedPhoto,
    clearCapturedPhotos,
    capturedCount: capturedPhotos.length,
  };
}
