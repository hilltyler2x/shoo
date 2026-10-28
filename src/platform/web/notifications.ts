import type { ScheduledNag } from '../../core/types';
import type { NotificationPort, PermissionState } from '../ports';

/**
 * Browsers can't schedule notifications for later, so this keeps timers
 * while the page is open. The phone apps use real scheduled notifications.
 */
export class WebNotifications implements NotificationPort {
  readonly firesWhenClosed = false;
  private timers = new Map<string, number>();

  async permission(): Promise<PermissionState> {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  }

  async request(): Promise<PermissionState> {
    if (!('Notification' in window)) return 'unsupported';
    const result = await Notification.requestPermission();
    return result === 'default' ? 'prompt' : result;
  }

  async schedule(nags: ScheduledNag[]): Promise<void> {
    await this.cancelAll();
    const now = Date.now();
    for (const nag of nags) {
      const delay = nag.at - now;
      if (delay <= 0 || delay > 2 ** 31 - 1) continue;
      this.timers.set(nag.id, window.setTimeout(() => void this.showNow(nag.title, nag.body), delay));
    }
  }

  async cancelAll(): Promise<void> {
    for (const t of this.timers.values()) window.clearTimeout(t);
    this.timers.clear();
  }

  async showNow(title: string, body: string): Promise<void> {
    if ((await this.permission()) !== 'granted') return;
    const options = { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'shoo' };
    // Android Chrome only allows notifications through the service worker.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  }
}
