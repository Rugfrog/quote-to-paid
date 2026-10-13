/** Small wrapper around fetch for the JSON API. Errors carry plain-English messages from the server. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined || isForm ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/login')) {
      window.dispatchEvent(new Event('qtp:logged-out'));
    }
    throw new ApiError(res.status, data.error ?? 'Something went wrong. Please try again.', data.fields ?? {});
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => send<T>('GET', url),
  post: <T>(url: string, body?: unknown) => send<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => send<T>('PUT', url, body),
  del: <T>(url: string) => send<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => send<T>('POST', url, form),
};

/** Turn any thrown value into a message for a toast or banner. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}
