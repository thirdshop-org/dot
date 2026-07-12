import { useCallback } from 'react';
import { createMMKV, useMMKVObject } from 'react-native-mmkv';
import { Batch } from '../types';

const storage = createMMKV({ id: 'vaultdrop-batches' });

export function useBatchStore() {
  const [batchIds, setBatchIds] = useMMKVObject<string[]>('batch-ids', storage);

  const saveBatch = useCallback((batch: Batch) => {
    storage.set(`batch_${batch.id}`, JSON.stringify(batch));
    const current = batchIds ?? [];
    if (!current.includes(batch.id)) {
      setBatchIds([batch.id, ...current]);
    }
  }, [batchIds, setBatchIds]);

  const getBatch = useCallback((id: string): Batch | undefined => {
    const raw = storage.getString(`batch_${id}`);
    if (!raw) return undefined;
    return JSON.parse(raw) as Batch;
  }, []);

  const getAllBatches = useCallback((): Batch[] => {
    return (batchIds ?? [])
      .map((id) => getBatch(id))
      .filter((b): b is Batch => b !== undefined);
  }, [batchIds, getBatch]);

  const addTagToBatch = useCallback((batchId: string, tag: string) => {
    const batch = getBatch(batchId);
    if (!batch) return;
    if (batch.tags.includes(tag)) return;
    batch.tags = [...batch.tags, tag];
    storage.set(`batch_${batchId}`, JSON.stringify(batch));
  }, [getBatch]);

  const removeTagFromBatch = useCallback((batchId: string, tag: string) => {
    const batch = getBatch(batchId);
    if (!batch) return;
    batch.tags = batch.tags.filter((t) => t !== tag);
    storage.set(`batch_${batchId}`, JSON.stringify(batch));
  }, [getBatch]);

  const deleteBatch = useCallback((batchId: string) => {
    storage.set(`batch_${batchId}`, undefined as any);
    storage.remove(`batch_${batchId}` as any);
    setBatchIds((batchIds ?? []).filter((id) => id !== batchId));
  }, [batchIds, setBatchIds]);

  return {
    saveBatch,
    getBatch,
    getAllBatches,
    addTagToBatch,
    removeTagFromBatch,
    deleteBatch,
  };
}
