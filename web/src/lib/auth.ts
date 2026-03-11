// Desktop-only mode — no authentication tokens needed.
// These stubs are kept for API compatibility with any code that still
// references them; they are effectively no-ops.

export function getToken(): string | null {
  return null;
}

export function setToken(_token: string): void {
  // no-op
}

export function clearToken(): void {
  // no-op
}

export function isAuthenticated(): boolean {
  return true;
}
