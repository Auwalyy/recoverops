import { PERMISSIONS, ROLE_DEFINITIONS, ROLES, type Permission } from '@recoveros/shared';
import { PermissionModel, RoleModel } from './access.models';

/** Mirror the code permission registry into MongoDB for querying/auditing (idempotent). */
export async function syncAccessRegistry(): Promise<void> {
  await PermissionModel.bulkWrite(
    (Object.entries(PERMISSIONS) as Array<[Permission, string]>).map(([code, description]) => ({
      updateOne: { filter: { code }, update: { $set: { code, description } }, upsert: true },
    })),
  );
  await RoleModel.bulkWrite(
    ROLES.map((code) => {
      const d = ROLE_DEFINITIONS[code];
      return {
        updateOne: {
          filter: { code },
          update: { $set: { code, name: d.name, kind: d.kind, accessScope: d.accessScope, permissions: [...d.permissions], system: true } },
          upsert: true,
        },
      };
    }),
  );
}
