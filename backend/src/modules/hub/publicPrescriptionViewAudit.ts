import type { Request } from 'express';
import { recordPrescriptionDocumentEvent } from './prescriptionDocumentIssue';

const VIEW_DEBOUNCE_MS = 60 * 60 * 1000;
const viewDebounce = new Map<string, number>();

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function clientUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && ua.trim() ? ua.trim().slice(0, 500) : null;
}

export async function maybeRecordPrescriptionViewed(
  req: Request,
  clinicId: string,
  documentId: string,
): Promise<void> {
  const ip = clientIp(req);
  const key = `${documentId}:${ip}`;
  const now = Date.now();
  const last = viewDebounce.get(key);
  if (last != null && now - last < VIEW_DEBOUNCE_MS) return;
  viewDebounce.set(key, now);

  await recordPrescriptionDocumentEvent({
    clinic_id: clinicId,
    document_id: documentId,
    event_type: 'viewed',
    actor_ip: ip,
    actor_user_agent: clientUserAgent(req),
  });
}

export async function recordPrescriptionPdfDownloaded(
  req: Request,
  clinicId: string,
  documentId: string,
): Promise<void> {
  await recordPrescriptionDocumentEvent({
    clinic_id: clinicId,
    document_id: documentId,
    event_type: 'pdf_downloaded',
    actor_ip: clientIp(req),
    actor_user_agent: clientUserAgent(req),
  });
}
