/**
 * Firebase mocks for Vitest.
 *
 * Provides vi.fn() stubs for every Firebase function that useAuth and
 * other hooks import. Tests control return values via mockResolvedValue /
 * mockRejectedValue per test case.
 */

// ─── firebase/auth stubs ─────────────────────────────────────────────────────
export const mockSignInWithEmailAndPassword = vi.fn();
export const mockCreateUserWithEmailAndPassword = vi.fn();
export const mockSignInWithPopup = vi.fn();
export const mockUpdateProfile = vi.fn();
export const mockSendEmailVerification = vi.fn();
export const mockSignOut = vi.fn();
export const mockDeleteUser = vi.fn();
export const mockGoogleAuthProvider = vi.fn();

// ─── firebase/firestore stubs ────────────────────────────────────────────────
export const mockDoc = vi.fn((_db, ...pathSegments) => {
  const path = pathSegments.join('/');
  const lastSegment = pathSegments[pathSegments.length - 1];
  return {
    _path: path,
    id: lastSegment || 'mock-auto-id',
  };
});
export const mockSetDoc = vi.fn();
export const mockGetDoc = vi.fn();
export const mockGetDocs = vi.fn();
export const mockCollection = vi.fn((_db, ...pathSegments) => {
  const path = pathSegments.join('/');
  const lastSegment = pathSegments[pathSegments.length - 1];
  return {
    _path: path,
    id: lastSegment || 'mock-auto-id',
  };
});
export const mockUpdateDoc = vi.fn();
export const mockAddDoc = vi.fn();
export const mockArrayUnion = vi.fn((...args) => args);
export const mockArrayRemove = vi.fn((...args) => args);
export const mockServerTimestamp = vi.fn(() => ({ _type: 'serverTimestamp' }));
export const mockRunTransaction = vi.fn();
export const mockDeleteDoc = vi.fn();
export const mockOnSnapshot = vi.fn((queryRef, callback) => {
  Promise.resolve(mockGetDocs()).then((snap) => {
    callback(snap);
  }).catch(() => {});
  return () => {};
});

// ─── Singleton stubs (src/lib/firebase.js) ───────────────────────────────────
const mockAuth = { currentUser: null };
const mockDb = { _type: 'firestore' };
const mockFunctions = { _type: 'functions' };

export { mockAuth, mockDb, mockFunctions };

// ─── Wire up module mocks ────────────────────────────────────────────────────

// Mock the local firebase singleton BEFORE any hook imports it
vi.mock('../lib/firebase', () => ({
  auth: mockAuth,
  db: mockDb,
  functions: mockFunctions,
  app: {},
}));

// Mock firebase/auth
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: mockSignInWithEmailAndPassword,
  createUserWithEmailAndPassword: mockCreateUserWithEmailAndPassword,
  signInWithPopup: mockSignInWithPopup,
  GoogleAuthProvider: mockGoogleAuthProvider,
  updateProfile: mockUpdateProfile,
  sendEmailVerification: mockSendEmailVerification,
  signOut: mockSignOut,
  deleteUser: mockDeleteUser,
  onAuthStateChanged: vi.fn(),
  getAuth: vi.fn(() => mockAuth),
}));

// ─── writeBatch helper mock declarations at module level ─────────────────────
export const mockBatchSet = vi.fn((docRef, data, options) => {
  return mockSetDoc(docRef, data, options);
});
export const mockBatchUpdate = vi.fn((docRef, data) => {
  return mockUpdateDoc(docRef, data);
});
export const mockBatchDelete = vi.fn((docRef) => {
  return mockDeleteDoc(docRef);
});

const pendingOps = [];
export const mockBatchCommit = vi.fn(async () => {
  const ops = [...pendingOps];
  pendingOps.length = 0;
  await Promise.all(ops);
});

export const mockWriteBatch = vi.fn(() => {
  const batch = {
    set: vi.fn((docRef, data, options) => {
      pendingOps.push(Promise.resolve(mockBatchSet(docRef, data, options)));
      return batch;
    }),
    update: vi.fn((docRef, data) => {
      pendingOps.push(Promise.resolve(mockBatchUpdate(docRef, data)));
      return batch;
    }),
    delete: vi.fn((docRef) => {
      pendingOps.push(Promise.resolve(mockBatchDelete(docRef)));
      return batch;
    }),
    commit: mockBatchCommit,
  };
  return batch;
});

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  setDoc: mockSetDoc,
  getDoc: mockGetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  addDoc: mockAddDoc,
  getDocs: mockGetDocs,
  collection: mockCollection,
  serverTimestamp: mockServerTimestamp,
  runTransaction: mockRunTransaction,
  onSnapshot: mockOnSnapshot,
  writeBatch: mockWriteBatch,
  getFirestore: vi.fn(() => mockDb),
  query: vi.fn((colRef) => colRef),
  orderBy: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  arrayUnion: mockArrayUnion,
  arrayRemove: mockArrayRemove,
}));

// Mock firebase/functions
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
  getFunctions: vi.fn(() => mockFunctions),
}));

// Mock framer-motion to avoid JSDOM animation issues
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, prop) => {
        // Return a forwardRef component for any HTML element (motion.div, motion.span, etc.)
        const { forwardRef } = require('react');
        return forwardRef((props, ref) => {
          const {
            children, initial, animate, transition, exit,
            whileHover, whileTap, onAnimationComplete,
            ...rest
          } = props;
          const Component = prop;
          return require('react').createElement(Component, { ...rest, ref }, children);
        });
      },
    }
  ),
  AnimatePresence: ({ children }) => children,
  // useReducedMotion must be exported so any component calling it won't crash
  useReducedMotion: () => false,
}));

