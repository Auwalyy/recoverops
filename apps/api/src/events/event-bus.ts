import { EventEmitter } from 'node:events';
import { logger } from '../config/logger';

/**
 * In-process domain event bus for side effects (realtime pushes, notifications,
 * analytics counters). Safety-critical logic (alert rule evaluation) is invoked
 * directly by services so it can never be lost by a failing listener; anything
 * that must survive a crash is enqueued on BullMQ by the listener.
 */
export interface DomainEvents {
  'episode.status_changed': { hospitalId: string; episodeId: string; patientId: string; from: string; to: string };
  'discharge.approved': { hospitalId: string; episodeId: string; patientId: string; planId: string; versionId: string };
  'task.completed': { hospitalId: string; episodeId: string; patientId: string; taskId: string };
  'task.missed': { hospitalId: string; episodeId: string; patientId: string; taskId: string; type: string };
  'checkin.submitted': { hospitalId: string; episodeId: string; patientId: string; checkInId: string };
  'symptom.reported': { hospitalId: string; episodeId: string; patientId: string; symptomId: string };
  'medication.event_reported': { hospitalId: string; episodeId: string; patientId: string; eventId: string; status: string };
  'alert.created': { hospitalId: string; alertId: string; episodeId: string; patientId: string; priority: string; recipientUserIds: string[] };
  'alert.updated': { hospitalId: string; alertId: string; status: string; recipientUserIds: string[] };
  'appointment.changed': { hospitalId: string; appointmentId: string; patientId: string; status: string };
  'message.created': { hospitalId: string; conversationId: string; messageId: string; recipientUserIds: string[] };
}

type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => void | Promise<void>;

class EventBus {
  private emitter = new EventEmitter({ captureRejections: false });

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof DomainEvents>(event: K, handler: Handler<K>): void {
    this.emitter.on(event, (payload: DomainEvents[K]) => {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => logger.error({ err, event }, 'Domain event handler failed'));
    });
  }

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  removeAll(): void {
    this.emitter.removeAllListeners();
  }
}

export const eventBus = new EventBus();
