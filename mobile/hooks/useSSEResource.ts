import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useResourceCreated } from '../contexts/SseContext';

export function SseResourceListener() {
  const queryClient = useQueryClient();
  const { onResourceCreated } = useResourceCreated();

  useEffect(() => {
    const unsub = onResourceCreated(() => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    });
    return unsub;
  }, [onResourceCreated, queryClient]);

  return null;
}
