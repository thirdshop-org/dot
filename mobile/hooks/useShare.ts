import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { ShareEntry } from '../types';

function shareEndpoint(resourceId: string) {
  return `/resources/${resourceId}/share`;
}

export function useShares(resourceId: string) {
  return useQuery({
    queryKey: ['shares', resourceId],
    queryFn: () => apiClient.get<ShareEntry[]>(shareEndpoint(resourceId)),
    enabled: !!resourceId,
  });
}

export function useGrantShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ resourceId, subjectUserId, role }: { resourceId: string; subjectUserId: string; role: string }) =>
      apiClient.post(shareEndpoint(resourceId), { subject_user_id: subjectUserId, role }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shares', variables.resourceId] });
    },
  });
}

export function useRevokeShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ resourceId, userId }: { resourceId: string; userId: string }) =>
      apiClient.delete(`${shareEndpoint(resourceId)}/${userId}`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shares', variables.resourceId] });
    },
  });
}

export function useCheckAccess(resourceId: string) {
  return useQuery({
    queryKey: ['access', resourceId],
    queryFn: () => apiClient.get<{ role: string; access: boolean }>(`/resources/${resourceId}/access`),
    enabled: !!resourceId,
  });
}
