import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import {
  addComment,
  approveDocument,
  createDocument,
  getDocument,
  listDocuments,
  rejectDocument,
  returnToDraft,
  submitDocument,
  updateDocument,
  type DocumentDraft,
} from "../api/documents";
import { listUsers } from "../api/users";
import { ApiError } from "../api/client";
import type { ApprovalDocument, Comment } from "../types/document";

export const documentKeys = {
  all: ["documents"] as const,
  detail: (id: string) => ["documents", id] as const,
};

export function useDocumentsQuery() {
  return useQuery({
    queryKey: documentKeys.all,
    queryFn: listDocuments,
    staleTime: 30_000,
  });
}

export function useDocumentQuery(id: string) {
  return useQuery({
    queryKey: documentKeys.detail(id),
    queryFn: () => getDocument(id),
    retry: (failureCount, error) =>
      // A 404 will not become a 200 by retrying.
      !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });
}

export function useUsersQuery() {
  return useQuery({ queryKey: ["users"], queryFn: listUsers, staleTime: Infinity });
}

/** Shared cache bookkeeping for every mutation that changes one document. */
function useDocumentMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<ApprovalDocument>,
  options?: Pick<UseMutationOptions<ApprovalDocument, Error, TVariables>, "onSuccess">,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (document, variables, context, mutation) => {
      queryClient.setQueryData(documentKeys.detail(document.id), document);
      queryClient.invalidateQueries({ queryKey: documentKeys.all, exact: true });
      options?.onSuccess?.(document, variables, context, mutation);
    },
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: DocumentDraft) => createDocument(draft),
    onSuccess: (document) => {
      queryClient.setQueryData(documentKeys.detail(document.id), document);
      queryClient.invalidateQueries({ queryKey: documentKeys.all, exact: true });
    },
  });
}

export function useUpdateDocument(id: string) {
  return useDocumentMutation((draft: Partial<DocumentDraft>) => updateDocument(id, draft));
}

export function useSubmitDocument(id: string) {
  return useDocumentMutation(({ actor }: { actor: string }) => submitDocument(id, actor));
}

export function useApproveDocument(id: string) {
  return useDocumentMutation(({ actor, comment }: { actor: string; comment?: string }) =>
    approveDocument(id, actor, comment),
  );
}

export function useRejectDocument(id: string) {
  return useDocumentMutation(({ actor, reason }: { actor: string; reason: string }) =>
    rejectDocument(id, actor, reason),
  );
}

export function useReturnToDraft(id: string) {
  return useDocumentMutation(({ actor }: { actor: string }) => returnToDraft(id, actor));
}

export function useAddComment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ author, text }: { author: string; text: string }): Promise<Comment> =>
      addComment(id, author, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.detail(id) });
    },
  });
}
