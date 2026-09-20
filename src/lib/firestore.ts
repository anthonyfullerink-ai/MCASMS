import { db } from './firebase-admin';
import { Firestore, FieldValue } from 'firebase-admin/firestore';

export interface DeviceRecord {
  id: string;                // The unique deviceId
  clientId: string;          // Reference to the parent Client
  secretKey: string;        // Hashed key for authentication
  lastHeartbeat: FieldValue | Date;
  batteryLevel: number;      // 0-100
  simStatus: 'active' | 'inactive' | 'no_sim' | 'searching';
  appVersion: string;
  deviceName: string;
  createdAt: FieldValue | Date;
  updatedAt: FieldValue | Date;
}

/**
 * Updates the heartbeat for a specific device.
 * Returns the updated device record or null if unauthorized/not found.
 */
export async function upsertDeviceHeartbeat(
  deviceId: string,
  secretKey: string,
  metrics: { batteryLevel: number; simStatus: string; appVersion: string }
): Promise<DeviceRecord | null> {
  const deviceRef = db.collection('devices').doc(deviceId);
  const doc = await deviceRef.get();

  if (!doc.exists) {
    console.error(`Device ${deviceId} not found in registry.`);
    return null;
  }

  const data = doc.data();
  if (data?.secretKey !== secretKey) {
    console.error(`Unauthorized heartbeat attempt for device ${deviceId}.`);
    return null;
  }

  const updateData = {
    lastHeartbeat: FieldValue.serverTimestamp(),
    batteryLevel: metrics.batteryLevel,
    simStatus: metrics.simStatus as any,
    appVersion: metrics.appVersion,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await deviceRef.update(updateData);

  return {
    id: deviceId,
    ...data,
    ...updateData,
  } as DeviceRecord;
}
