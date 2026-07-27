export type FileDetectedEvent = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  source: 'download' | 'mediastore' | 'startup';
};

export type ExpoDownloadDetectModuleEvents = {
  onNewFile: (event: FileDetectedEvent) => void;
};
