import { isAxiosError } from 'axios'
import { toast } from 'sonner'

const STATUS_MESSAGES: Record<number, string> = {
  429: 'Too many attempts. Please wait a moment and try again.',
  403: "You don't have permission to perform this action.",
  404: "We couldn't find what you asked for. It may have been deleted.",
  500: 'Something went wrong at our end. Please try again in a few minutes.',
  503: 'The system is temporarily unavailable. Please try again in a few minutes.',
}

/**
 * toastApiError for a request made with `responseType: 'blob'`: axios hands back the
 * error body as a Blob too, so the server's `detail` has to be read out of it before
 * the generic handling can find it.
 */
export async function toastBlobApiError(
  error: unknown,
  fallback: string,
  overrides?: Record<number, string>,
): Promise<void> {
  if (isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      error.response.data = JSON.parse(await error.response.data.text())
    } catch {
      // Not a JSON body (e.g. a proxy error page) — the generic handling covers it.
    }
  }
  toastApiError(error, fallback, overrides)
}

export function toastApiError(
  error: unknown,
  fallback: string,
  // Per-call status messages, checked before STATUS_MESSAGES. Needed when an endpoint gives a
  // status a narrower meaning than the generic one — e.g. 403 from POST /auth/me/password means
  // "wrong current password", not "you lack permission".
  overrides?: Record<number, string>,
): void {
  if (isAxiosError(error) && error.response) {
    const { status, data } = error.response
    const message =
      overrides?.[status] ??
      STATUS_MESSAGES[status] ??
      (data?.detail as string | undefined) ??
      (data?.message as string | undefined) ??
      (data?.error as string | undefined) ??
      fallback
    toast.error(message)
  } else {
    toast.error(fallback)
  }
}
