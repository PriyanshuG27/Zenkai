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
export const mockDoc = vi.fn((_db, ...pathSegments) => ({
  _path: pathSegments.join('/'),
}));
export const mockSetDoc = vi.fn();
export const mockGetDoc = vi.fn();
export const mockServerTimestamp = vi.fn(() => ({ _type: 'serverTimestamp' }));

// ─── Singleton stubs (src/lib/firebase.js) ───────────────────────────────────
export const mockAuth = { currentUser: null };
export const mockDb = { _type: 'firestore' };
export const mockFunctions = { _type: 'functions' };

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

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  setDoc: mockSetDoc,
  getDoc: mockGetDoc,
  getDocs: vi.fn(),
  collection: vi.fn(),
  serverTimestamp: mockServerTimestamp,
  writeBatch: vi.fn(),
  getFirestore: vi.fn(() => mockDb),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
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
          const { children, initial, animate, transition, exit, whileHover, whileTap, ...rest } = props;
          const Component = prop;
          return require('react').createElement(Component, { ...rest, ref }, children);
        });
      },
    }
  ),
  AnimatePresence: ({ children }) => children,
}));
