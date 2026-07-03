jest.mock('../prescriptionDocumentIssue', () => ({
  recordPrescriptionDocumentEvent: jest.fn().mockResolvedValue(undefined),
}));

import type { Request } from 'express';
import { recordPrescriptionDocumentEvent } from '../prescriptionDocumentIssue';
import { maybeRecordPrescriptionViewed } from '../publicPrescriptionViewAudit';

function mockReq(ip = '203.0.113.10'): Request {
  return {
    ip,
    socket: { remoteAddress: ip },
    headers: { 'user-agent': 'jest-test-agent' },
  } as Request;
}

describe('publicPrescriptionViewAudit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registra evento viewed na primeira consulta', async () => {
    await maybeRecordPrescriptionViewed(mockReq(), 'clinic-1', 'doc-1');
    expect(recordPrescriptionDocumentEvent).toHaveBeenCalledTimes(1);
    expect(recordPrescriptionDocumentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: 'clinic-1',
        document_id: 'doc-1',
        event_type: 'viewed',
        actor_ip: '203.0.113.10',
      }),
    );
  });

  it('aplica debounce de 1h por IP e documento', async () => {
    const req = mockReq('198.51.100.20');
    await maybeRecordPrescriptionViewed(req, 'clinic-1', 'doc-debounce');
    await maybeRecordPrescriptionViewed(req, 'clinic-1', 'doc-debounce');
    expect(recordPrescriptionDocumentEvent).toHaveBeenCalledTimes(1);
  });

  it('registra nova visualização para outro IP', async () => {
    await maybeRecordPrescriptionViewed(mockReq('198.51.100.21'), 'clinic-1', 'doc-multi-ip');
    await maybeRecordPrescriptionViewed(mockReq('198.51.100.22'), 'clinic-1', 'doc-multi-ip');
    expect(recordPrescriptionDocumentEvent).toHaveBeenCalledTimes(2);
  });
});
