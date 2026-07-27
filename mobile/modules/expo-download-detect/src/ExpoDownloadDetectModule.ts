import { NativeModule, requireNativeModule } from 'expo';
import { ExpoDownloadDetectModuleEvents, FileDetectedEvent } from './ExpoDownloadDetect.types';

declare class ExpoDownloadDetectModule extends NativeModule<ExpoDownloadDetectModuleEvents> {
  startWatching(): void;
  stopWatching(): void;
  getRecentDownloads(): Promise<FileDetectedEvent[]>;
}

export default requireNativeModule<ExpoDownloadDetectModule>('ExpoDownloadDetect');
