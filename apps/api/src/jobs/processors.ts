/**
 * Importing these modules registers their job processors with the queue (each calls
 * `registerProcessor` at module load). Keeping the list explicit documents every
 * background job in one place.
 *
 *  notifications.deliver     → notification.service
 *  tasks.generate-window     → recovery-plan.service (daily)
 *  tasks.mark-missed         → task.service (every 15 min)
 *  tasks.send-reminders      → task.service (every 5 min)
 *  alerts.escalate           → alert-engine (delayed per alert)
 *  alerts.escalation-sweep   → alert-engine (every 2 min safety net)
 *  appointments.reminders    → appointment.service (every 15 min)
 *  subscriptions.lifecycle   → billing.service (daily)
 */
import '../modules/notifications/notification.service';
import '../modules/recovery-plans/recovery-plan.service';
import '../modules/recovery-plans/task.service';
import '../modules/alerts/alert-engine';
import '../modules/appointments/appointment.service';
import '../modules/billing/billing.service';

export function registerJobProcessors(): void {
  // Registration happens via the side-effect imports above.
}
