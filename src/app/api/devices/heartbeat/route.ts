import { NextApiRequest, NextApiResponse } from 'next';
import { upsertDeviceHeartbeat } from '@/lib/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { deviceId, secretKey, metrics } = req.body;

  if (!deviceId || !secretKey || !metrics) {
    return res.status(400).json({ error: 'Missing required fields: deviceId, secretKey, or metrics' });
  }

  try {
    const updatedDevice = await upsertDeviceHeartbeat(
      deviceId,
      secretKey,
      {
        batteryLevel: metrics.batteryLevel,
        simStatus: metrics.simStatus,
        appVersion: metrics.appVersion || '1.0.0',
      }
    );

    if (!updatedDevice) {
      return res.status(401).json({ error: 'Unauthorized or device not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Heartbeat recorded',
      deviceId: updatedDevice.id
    });
  } catch (error: any) {
    console.error('Heartbeat API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
