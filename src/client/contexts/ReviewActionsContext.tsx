import { createContext, useContext } from 'react';

// Review actions reachable from any comment form or thread card without prop drilling.
export interface ReviewActions {
  // Sends every pending comment to the agent (Cmd/Ctrl+Enter after saving).
  requestSubmit?: () => void;
  reopenThread?: (threadId: string) => void;
  deleteThread?: (threadId: string) => void;
}

const ReviewActionsContext = createContext<ReviewActions>({});

export const ReviewActionsProvider = ReviewActionsContext.Provider;

export function useReviewActions(): ReviewActions {
  return useContext(ReviewActionsContext);
}
