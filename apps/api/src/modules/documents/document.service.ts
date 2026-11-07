import { Types } from 'mongoose';
import { randomUUID, createHash } from 'node:crypto';
import type { DocumentType } from '@recoveros/shared';
import { errors, AppError } from '../../utils/errors';
import { audit } from '../audit/audit.service';
import { requireTenant, type Principal } from '../access/principal';
import { assertPatientRelationship, assertPermission, loadEpisode, toObjectId } from '../access/access.service';
import { detectFileType, storage } from '../../integrations/storage/storage';
import { DocumentModel } from './document.model';

const PATIENT_UPLOAD_TYPES: DocumentType[] = ['ATTACHMENT', 'PATIENT_DOCUMENT'];

export async function uploadDocument(
  p: Principal,
  file: { buffer: Buffer; originalname: string; size: number } | undefined,
  input: { episodeId?: string; patientId?: string; type: DocumentType; title: string; visibility?: 'STAFF_ONLY' | 'PATIENT_VISIBLE' },
) {
  if (!file) throw errors.validation('A file is required');
  const hospitalId = requireTenant(p);
  const detected = detectFileType(file.buffer);
  if (!detected) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Only PDF, JPEG, PNG, WEBP, HEIC images and M4A audio are accepted');

  let patientId: Types.ObjectId;
  let episodeId: Types.ObjectId | undefined;
  if (input.episodeId) {
    const ep = await loadEpisode(p, input.episodeId, p.kind === 'STAFF' ? 'documents.manage' : 'checkins.create');
    patientId = ep.patientId as Types.ObjectId;
    episodeId = ep._id;
  } else if (input.patientId) {
    patientId = toObjectId(input.patientId);
    await assertPatientRelationship(p, patientId, p.kind === 'STAFF' ? 'documents.manage' : 'checkins.create');
  } else if (p.kind === 'PATIENT' && p.patientIds[0]) {
    patientId = toObjectId(p.patientIds[0]);
  } else throw errors.validation('episodeId or patientId is required');

  if (p.kind !== 'STAFF' && !PATIENT_UPLOAD_TYPES.includes(input.type)) throw errors.forbidden('Patients can only upload attachments');
  if (p.kind === 'STAFF') assertPermission(p, 'documents.manage');

  const key = `${String(hospitalId)}/${String(patientId)}/${randomUUID()}.${detected.ext}`;
  await storage().put(key, file.buffer, detected.mime);
  const doc = await DocumentModel.create({
    hospitalId,
    patientId,
    episodeId,
    type: input.type,
    title: input.title,
    storageKey: key,
    mimeType: detected.mime,
    sizeBytes: file.size,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    // Patient uploads are visible to the patient; staff choose explicitly.
    visibility: p.kind === 'STAFF' ? (input.visibility ?? 'STAFF_ONLY') : 'PATIENT_VISIBLE',
    uploadedBy: p.userId,
    uploaderKind: p.kind,
  });
  await audit({ action: 'DOCUMENT_UPLOADED', resourceType: 'Document', resourceId: String(doc._id), patientId: String(patientId), metadata: { type: input.type, mime: detected.mime, size: file.size } });
  return doc;
}

export async function listDocuments(p: Principal, q: { episodeId?: string; patientId?: string }) {
  const hospitalId = requireTenant(p);
  const filter: Record<string, unknown> = { hospitalId, status: 'ACTIVE' };
  if (q.episodeId) {
    const ep = await loadEpisode(p, q.episodeId, 'documents.read');
    filter.episodeId = ep._id;
  } else if (q.patientId) {
    await assertPatientRelationship(p, toObjectId(q.patientId), 'documents.read');
    filter.patientId = toObjectId(q.patientId);
  } else if (p.kind === 'PATIENT') {
    filter.patientId = { $in: p.patientIds.map(toObjectId) };
  } else if (p.kind === 'CAREGIVER') {
    filter.patientId = { $in: p.caregiverGrants.filter((g) => g.permissions.has('documents.read')).map((g) => toObjectId(g.patientId)) };
  } else throw errors.validation('episodeId or patientId is required');
  if (p.kind !== 'STAFF') filter.visibility = 'PATIENT_VISIBLE';
  return DocumentModel.find(filter).sort({ createdAt: -1 }).populate('uploadedBy', 'firstName lastName');
}

/** Issue a short-lived download link after access checks. */
export async function getDownloadUrl(p: Principal, id: string) {
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(id)) throw errors.notFound('Document');
  const doc = await DocumentModel.findOne({ _id: id, hospitalId, status: 'ACTIVE' }).select('+storageKey');
  if (!doc) throw errors.notFound('Document');
  await assertPatientRelationship(p, doc.patientId as Types.ObjectId, 'documents.read');
  if (p.kind !== 'STAFF' && doc.visibility !== 'PATIENT_VISIBLE') throw errors.notFound('Document');
  const url = await storage().signedDownloadUrl(doc.storageKey, { expiresInSeconds: 300, fileName: `${doc.title.replace(/[^\w.-]+/g, '_')}`, contentType: doc.mimeType });
  await audit({ action: 'DOCUMENT_DOWNLOAD_LINK_ISSUED', resourceType: 'Document', resourceId: id, patientId: String(doc.patientId) });
  return { url, expiresInSeconds: 300, mimeType: doc.mimeType };
}

export async function deleteDocument(p: Principal, id: string) {
  assertPermission(p, 'documents.manage');
  const hospitalId = requireTenant(p);
  const doc = await DocumentModel.findOne({ _id: id, hospitalId, status: 'ACTIVE' });
  if (!doc) throw errors.notFound('Document');
  await assertPatientRelationship(p, doc.patientId as Types.ObjectId, 'documents.manage');
  doc.status = 'DELETED';
  doc.deletedAt = new Date();
  doc.deletedBy = new Types.ObjectId(p.userId);
  await doc.save();
  await audit({ action: 'DOCUMENT_DELETED', resourceType: 'Document', resourceId: id, patientId: String(doc.patientId) });
  return doc;
}
