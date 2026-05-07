export const ADMIN_LIVE_REFRESH_EVENT = 'bg-admin-live-refresh';

export function requestAdminLiveRefresh(): void {
  window.dispatchEvent(new Event(ADMIN_LIVE_REFRESH_EVENT));
}
