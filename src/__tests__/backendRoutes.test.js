import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock active rest timers map
const mockActiveTimeouts = new Map();
vi.mock('../../backend/lib/activeRestTimers', () => mockActiveTimeouts);
const activeRestTimersPath = require.resolve('../../backend/lib/activeRestTimers');
require.cache[activeRestTimersPath] = {
  id: activeRestTimersPath,
  filename: activeRestTimersPath,
  loaded: true,
  exports: mockActiveTimeouts,
};

// Mock fcmSender
const mockSendPushNotification = vi.fn().mockResolvedValue({ success: true });
vi.mock('../../backend/lib/fcmSender', () => ({
  sendPushNotification: mockSendPushNotification,
}));
const fcmSenderPath = require.resolve('../../backend/lib/fcmSender');
require.cache[fcmSenderPath] = {
  id: fcmSenderPath,
  filename: fcmSenderPath,
  loaded: true,
  exports: {
    sendPushNotification: mockSendPushNotification,
  },
};

// Mock firebaseAdmin
const mockAdminDbSet = vi.fn().mockResolvedValue();
const mockAdminDbUpdate = vi.fn().mockResolvedValue();
const mockAdminDbGet = vi.fn();
const mockAdminDbDoc = vi.fn((path) => ({
  get: mockAdminDbGet,
  set: mockAdminDbSet,
  update: mockAdminDbUpdate,
}));

// Mock firebase-admin globally for CommonJS requires
vi.mock('firebase-admin', () => {
  const mockDb = {
    doc: (path) => mockAdminDbDoc(path),
  };
  return {
    default: {
      apps: { length: 1 },
      initializeApp: () => {},
      credential: {
        cert: () => {},
      },
      firestore: () => mockDb,
      auth: () => ({
        verifyIdToken: vi.fn(),
      }),
    },
  };
});

// Setup mock in require.cache BEFORE loading the routes
const firebaseAdminPath = require.resolve('../../backend/lib/firebaseAdmin');
require.cache[firebaseAdminPath] = {
  id: firebaseAdminPath,
  filename: firebaseAdminPath,
  loaded: true,
  exports: {
    admin: {},
    adminDb: {
      doc: mockAdminDbDoc,
      runTransaction: vi.fn(async (cb) => {
        const mockTransaction = {
          get: (ref) => ref.get(),
          set: (ref, data, options) => ref.set(data, options),
          update: (ref, data) => ref.update(data),
        };
        return await cb(mockTransaction);
      }),
    },
    adminAuth: {
      verifyIdToken: vi.fn(),
    },
  },
};

// Now import/require the routes dynamically
const scheduleRestNotificationRoute = require('../../backend/routes/scheduleRestNotification');
const sendNotificationRoute = require('../../backend/routes/sendNotification');
const openTreasureChestRoute = require('../../backend/routes/openTreasureChest');

// Helper mock req/res creator
function createMockReqRes(body, uid) {
  const req = {
    body,
    user: { uid: uid || 'test-user-uid' },
  };
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return { req, res };
}

describe('Backend Routes Unit Tests', () => {
  let clearTimeoutSpy;
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTimeouts.clear();
    vi.useFakeTimers();
    clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
  });

  afterEach(() => {
    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  // ─── 4️⃣ Rest Timer (scheduleRestNotification) ───────────────────────────
  describe('scheduleRestNotification route', () => {
    const handler = scheduleRestNotificationRoute[1];

    it('rejects missing or invalid seconds parameter', async () => {
      for (const bad of [undefined, null, -5, 0, 601, '30', NaN, Infinity]) {
        const { req, res } = createMockReqRes({ seconds: bad });
        await handler(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain('seconds must be a positive number');
      }
    });

    it('successfully schedules a rest timer, cancels existing, and triggers push', async () => {
      const existingTimerId = setTimeout(() => {}, 1000);
      mockActiveTimeouts.set('test-user-uid', existingTimerId);

      const { req, res } = createMockReqRes({ seconds: 30 });
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Notification scheduled in 30s.');

      // The old timeout should be cleared and deleted
      expect(clearTimeoutSpy).toHaveBeenCalledWith(existingTimerId);
      expect(mockActiveTimeouts.has('test-user-uid')).toBe(true);

      // Fast-forward time to fire the timeout
      vi.advanceTimersByTime(30 * 1000);

      // Check push was sent
      expect(mockSendPushNotification).toHaveBeenCalledWith({
        recipientUids: ['test-user-uid'],
        title: 'Zenkai Rest Timer',
        body: 'Rest over! Time for your next set. 💪',
        data: {
          url: '/home',
          type: 'rest-timer'
        }
      });

      // Timeout reference should be deleted after running
      expect(mockActiveTimeouts.has('test-user-uid')).toBe(false);
    });
  });

  // ─── 5️⃣ & 7️⃣ Notification Security (sendNotification) ───────────────────
  describe('sendNotification route', () => {
    const handler = sendNotificationRoute[1];

    it('rejects if squadCode, title, or body is missing or too long', async () => {
      const tests = [
        { body: { title: 't', body: 'b' }, status: 400, err: 'squadCode is required' },
        { body: { squadCode: 'S1', body: 'b' }, status: 400, err: 'Title and body are required' },
        { body: { squadCode: 'S1', title: 'a'.repeat(101), body: 'b' }, status: 400, err: 'Title must be a string under' },
        { body: { squadCode: 'S1', title: 't', body: 'a'.repeat(301) }, status: 400, err: 'Body must be a string under' },
        { body: { squadCode: 'S1', title: 't', body: 'b', recipientUids: 'not-array' }, status: 400, err: 'recipientUids must be an array' },
      ];

      for (const t of tests) {
        const { req, res } = createMockReqRes(t.body);
        await handler(req, res);
        expect(res.statusCode).toBe(t.status);
        expect(res.body.error).toContain(t.err);
      }
    });

    it('returns 404 if squad does not exist', async () => {
      mockAdminDbGet.mockResolvedValueOnce({ exists: false });

      const { req, res } = createMockReqRes({ squadCode: 'FAKESQUAD', title: 'test', body: 'test' });
      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Squad not found.');
    });

    it('returns 403 if sender is not in the squad', async () => {
      mockAdminDbGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ memberUids: ['userA', 'userB'] })
      });

      const { req, res } = createMockReqRes(
        { squadCode: 'SQUAD1', title: 'test', body: 'test' },
        'userC' // User C is not in the squad
      );
      await handler(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('You are not a member of this squad.');
    });

    it('successfully filters recipients and sends notification', async () => {
      mockAdminDbGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ memberUids: ['userA', 'userB', 'userC'] })
      });

      // Target only userC specifically, and include userD (who is not in the squad)
      const { req, res } = createMockReqRes(
        { 
          squadCode: 'SQUAD1', 
          title: 'Squad Action', 
          body: 'Hello squad', 
          recipientUids: ['userC', 'userD', 'userA'] 
        },
        'userA' // Sender is userA
      );
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      // Should filter out sender (userA) and non-member (userD), leaving only userC
      expect(mockSendPushNotification).toHaveBeenCalledWith({
        recipientUids: ['userC'],
        title: 'Squad Action',
        body: 'Hello squad',
        data: {
          url: '/squad'
        }
      });
    });
  });

  // ─── 6️⃣ Chest Opening (openTreasureChest) ──────────────────────────────
  describe('openTreasureChest route', () => {
    const handler = openTreasureChestRoute[1];

    it('rejects invalid chest type', async () => {
      const { req, res } = createMockReqRes({ chestType: 'invalid' });
      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Invalid chest type');
    });

    it('returns 404 if user profile is missing', async () => {
      mockAdminDbGet.mockResolvedValueOnce({ exists: false });

      const { req, res } = createMockReqRes({ chestType: 'common' });
      await handler(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('User profile not found.');
    });

    it('rejects if user does not have enough boss keys', async () => {
      mockAdminDbGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          powerUps: { bossFightKey: 0 }
        })
      });

      const { req, res } = createMockReqRes({ chestType: 'common' });
      await handler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Insufficient Boss Keys');
    });

    it('successfully opens chest, updates store/XP, and returns rewards', async () => {
      mockAdminDbGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          xp: 100,
          level: 2,
          powerUps: { bossFightKey: 2 }
        })
      });

      const { req, res } = createMockReqRes({ chestType: 'common' });
      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.chestType).toBe('common');
      expect(res.body.nextKeys).toBe(1); // 2 - 1 = 1 remaining key

      // Check updateDoc/setDoc was called with updated xp and level
      expect(mockAdminDbSet).toHaveBeenCalledWith(
        expect.objectContaining({
          xp: expect.any(Number),
          level: expect.any(Number),
          powerUps: expect.objectContaining({
            bossFightKey: 1
          })
        }),
        { merge: true }
      );
    });
  });
});
