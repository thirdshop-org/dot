import { useEffect, useState, useCallback, useRef } from 'react';
import { useCameraDevice, useCameraPermission, usePhotoOutput, type TorchMode, type CameraRef } from 'react-native-vision-camera';
import { useUpload } from './useUpload';

type CaptureStatus = 'idle' | 'capturing' | 'uploading' | 'processing' | 'success' | 'error';

export function useCameraCapture() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cameraRef = useRef<CameraRef>(null);

  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>('idle');
  const [captureError, setCaptureError] = useState<string>();
  const [torchMode, setTorchMode] = useState<TorchMode>('off');
  const [cameraReady, setCameraReady] = useState(false);

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

  const capturePhoto = useCallback(async () => {
    if (!photoOutput) return;

    try {
      setCaptureStatus('capturing');
      setCaptureError(undefined);

      const { filePath } = await photoOutput.capturePhotoToFile(
        {},
        {}
      );

      setCaptureStatus('uploading');

      const result = await upload.mutateAsync([
        { uri: 'file://' + filePath, type: 'image/jpeg', name: 'scan.jpg' },
      ]);

      if (result.errors.length > 0) {
        setCaptureStatus('error');
        setCaptureError(result.errors[0].message);
      } else {
        setCaptureStatus('success');
      }
    } catch (err) {
      setCaptureStatus('error');
      setCaptureError(err instanceof Error ? err.message : 'Erreur lors de la capture');
    }
  }, [photoOutput, upload]);

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
  };
}
