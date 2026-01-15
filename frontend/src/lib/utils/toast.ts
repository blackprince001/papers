import { toast as sonnerToast } from 'sonner';

// Re-export toast for direct usage
export { toast } from 'sonner';

// Helper functions for common toast types
export const toastSuccess = (message: string) => {
  sonnerToast.success(message);
};

export const toastError = (message: string) => {
  sonnerToast.error(message);
};

export const toastInfo = (message: string) => {
  sonnerToast.info(message);
};

export const toastWarning = (message: string) => {
  sonnerToast.warning(message);
};











