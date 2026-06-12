import { mockDoc, mockSetDoc, mockGetDoc, mockGetDocs, mockOnSnapshot, mockDeleteDoc, mockUpdateDoc } from '../__mocks__/firebase';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { useSquadStore } from '../stores/useSquadStore';
import { SquadMatchmaker } from '../components/desktop/SquadMatchmaker';
import { callZenkaiAPI } from '../lib/apiClient';

// Wrap SquadMatchmaker with MemoryRouter since it uses useNavigate()
const renderSquad = () => render(<MemoryRouter><SquadMatchmaker /></MemoryRouter>);
const rerenderSquad = (rerender) => rerender(<MemoryRouter><SquadMatchmaker /></MemoryRouter>);

// Mock recharts components
vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    ResponsiveContainer: ({ children }) => (
      <div data-testid="responsive-container">
        {children}
      </div>
    ),
    RadarChart: ({ children }) => <div data-testid="radar-chart">{children}</div>,
    PolarGrid: () => <div />,
    PolarAngleAxis: () => <div />,
    PolarRadiusAxis: () => <div />,
    Radar: () => <div />,
    LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
    Line: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    CartesianGrid: () => <div />,
    Tooltip: () => <div />,
  };
});

// Mock notification helper
vi.mock('../utils/notificationHelper', () => ({
  requestNotificationPermission: vi.fn(),
  sendBrowserNotification: vi.fn(),
  sendPushNotification: vi.fn(),
}));

// Mock API client
vi.mock('../lib/apiClient', () => ({
  callZenkaiAPI: vi.fn(),
}));

describe('SquadMatchmaker Draft & Invite System', () => {
  let mockSquads = [];
  let mockInvites = [];
  let mockFreeAgents = [];
  let mockPresence = [];
  let mockPolls = [];
  let mockActivityFeed = [];

  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
    window.alert = vi.fn();

    mockSquads = [];
    mockInvites = [];
    mockFreeAgents = [];
    mockPresence = [];
    mockPolls = [];
    mockActivityFeed = [];

    // Reset stores
    useAuthStore.setState({
      uid: 'uid-test-123',
      profile: {
        name: 'Priyanshu',
        gymId: 'test_gym',
        gymName: 'Test Gym',
        lookingForSquad: true,
        squadCode: 'FIT-PRIY123',
        xp: 1500,
        level: 3,
        streak: 5,
        badges: [],
        powerUps: {},
      },
      loading: false,
    });

    useSquadStore.setState({
      id: null,
      squadName: '',
      members: [],
      weeklyXPMultiplier: 1.0,
    });

    // Mock getDocs to resolve successfully for sessions subcollections
    mockGetDocs.mockResolvedValue({
      forEach: () => {},
      docs: [],
    });

    // Mock getDoc for user PRs / user profile
    mockGetDoc.mockImplementation(async (ref) => {
      const path = ref?._path || '';
      if (path.includes('prs/barbell_bench_press')) {
        return { exists: () => true, data: () => ({ weight: '100' }) };
      }
      if (path.includes('prs/barbell_squat')) {
        return { exists: () => true, data: () => ({ weight: '140' }) };
      }
      if (path.includes('users/uid-test-123')) {
        return {
          exists: () => true,
          data: () => ({
            uid: 'uid-test-123',
            name: 'Priyanshu',
            squadCode: 'FIT-PRIY123',
            gymId: 'test_gym',
            lookingForSquad: true,
          }),
        };
      }
      return { exists: () => false };
    });

    // Setup state-controlled mockOnSnapshot
    mockOnSnapshot.mockImplementation((queryRef, callback) => {
      const path = queryRef?._path || '';
      const segments = path.split('/');
      const isDoc = segments.length % 2 === 0;
      console.log('mockOnSnapshot path:', path, 'isDoc:', isDoc);

      if (isDoc) {
        // Document reference
        callback({
          exists: () => true,
          data: () => ({
            uid: segments[segments.length - 1] === 'FIT-PRIY123' ? 'uid-test-123' : 'agent-bob',
            name: segments[segments.length - 1] === 'FIT-PRIY123' ? 'Priyanshu (You)' : 'Bob Builder',
            squadCode: segments[segments.length - 1],
            streak: 5,
            volume: 2000,
            badges: [],
            powerUps: {},
            updatedAt: segments[segments.length - 1] === 'FIT-PRIY123' ? new Date() : new Date(Date.now() - 48 * 60 * 60 * 1000),
          }),
          id: segments[segments.length - 1],
        });
      } else {
        // Collection / Query reference
        let docs = [];
        if (path === 'shared_squads') {
          docs = mockSquads;
        } else if (path === 'squad_codes') {
          docs = mockFreeAgents;
        } else if (path === 'squad_invites') {
          docs = mockInvites;
        } else if (path.endsWith('/presence')) {
          docs = mockPresence;
        } else if (path.endsWith('/polls')) {
          docs = mockPolls;
        } else if (path.endsWith('/activity_feed')) {
          docs = mockActivityFeed;
        }

        callback({
          docs,
          forEach: (cb) => docs.forEach(cb),
        });
      }
      return () => {};
    });
  });

  it('renders onboarding state when user is not in any squad', async () => {
    mockSquads = [];

    renderSquad();

    await waitFor(() => {
      expect(screen.getByText(/Create a New Squad/i)).toBeInTheDocument();
      expect(screen.getByText(/Join an Existing Squad/i)).toBeInTheDocument();
    });
  });

  it('renders active squad tabs when user is in a squad', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
        creatorUid: 'uid-test-123',
      }),
    }];

    renderSquad();

    await waitFor(() => {
      expect(screen.getAllByText(/Iron Temple Bros/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/🗳️ Synergy & Scheduler/i)).toBeInTheDocument();
      expect(screen.getByText(/🛡️ Command War Room/i)).toBeInTheDocument();
      expect(screen.getByText(/💸 Moneyball Draft/i)).toBeInTheDocument();
    });
  });

  it('renders free agent registry and warning banner correctly based on gym configuration', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
        creatorUid: 'uid-test-123',
      }),
    }];

    // 1. Gym is not configured
    useAuthStore.setState({
      profile: {
        name: 'Priyanshu',
        gymId: '',
        gymName: '',
        lookingForSquad: undefined,
      },
    });

    const { rerender } = renderSquad();

    // Go to Moneyball Draft tab
    const draftTab = await screen.findByText(/💸 Moneyball Draft/i);
    fireEvent.click(draftTab);

    await waitFor(() => {
      expect(screen.getByText(/Gym Configuration Required/i)).toBeInTheDocument();
    });

    // 2. Gym is configured
    act(() => {
      useAuthStore.setState({
        profile: {
          name: 'Priyanshu',
          gymId: 'test_gym',
          gymName: 'Test Gym',
          lookingForSquad: true,
        },
      });
    });

    rerenderSquad(rerender);

    await waitFor(() => {
      expect(screen.getByText(/Register as Free Agent/i)).toBeInTheDocument();
      expect(screen.getByText(/ON \(Looking for Squad\)/i)).toBeInTheDocument();
    });
  });

  it('toggles lookingForSquad status on clicking the toggle button', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
      }),
    }];

    renderSquad();

    const draftTab = await screen.findByText(/💸 Moneyball Draft/i);
    fireEvent.click(draftTab);

    const toggleBtn = await screen.findByText(/ON \(Looking for Squad\)/i);
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
      expect(useAuthStore.getState().profile.lookingForSquad).toBe(false);
    });
  });

  it('displays incoming invites and handles Accept, Decline, and Decline & Turn Off', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
      }),
    }];

    mockInvites = [{
      data: () => ({
        inviteId: 'SQ-INVITE-123',
        squadCode: 'SQ-OTHER',
        squadName: 'Gold Gym Elite',
        inviterUid: 'uid-other-456',
        inviterName: 'Aarav Patel',
        inviteeUid: 'uid-test-123',
        status: 'pending',
      }),
    }];

    // Mock squad check on accept
    mockGetDoc.mockImplementation(async (ref) => {
      return {
        exists: () => true,
        data: () => ({
          squadCode: 'SQ-OTHER',
          squadName: 'Gold Gym Elite',
          memberLimit: 5,
          members: [],
          memberUids: [],
        }),
      };
    });

    renderSquad();

    await waitFor(() => {
      expect(screen.getByText(/Pending Squad Invitations/i)).toBeInTheDocument();
      expect(screen.getByText((content, node) => node.textContent === 'Aarav Patel invited you to join Gold Gym Elite')).toBeInTheDocument();
    });

    // Test Accept
    const acceptBtn = screen.getByText('Accept');
    fireEvent.click(acceptBtn);
    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });

    // Test Decline & Turn Off
    const declineMuteBtn = screen.getByText('Decline & Turn Off Invites');
    fireEvent.click(declineMuteBtn);
    await waitFor(() => {
      expect(useAuthStore.getState().profile.lookingForSquad).toBe(false);
    });
  });

  it('renders free agents in the table and allows sending a draft invite', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
      }),
    }];

    mockFreeAgents = [{
      data: () => ({
        uid: 'agent-bob',
        name: 'Bob Builder',
        squadCode: 'FIT-BOBB123',
        consistency: 85,
        squatPR: 160,
        benchPR: 100,
        goal: 'Strength',
        streak: 10,
        level: 5,
        volume: 5000,
        lookingForSquad: true,
        gymId: 'test_gym',
      }),
    }];

    renderSquad();

    const draftTab = await screen.findByText(/💸 Moneyball Draft/i);
    fireEvent.click(draftTab);

    await waitFor(() => {
      expect(screen.getByText('Bob Builder')).toBeInTheDocument();
    });

    const draftBtn = screen.getByRole('button', { name: 'Draft' });
    fireEvent.click(draftBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('handles squad creation successfully', async () => {
    mockSquads = [];

    renderSquad();

    const newSquadNameInput = await screen.findByPlaceholderText('e.g. Iron Temple Bros');
    fireEvent.change(newSquadNameInput, { target: { value: 'New Squad A' } });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '4' } });

    const createBtn = screen.getByRole('button', { name: 'Create Squad' });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('handles joining a squad successfully', async () => {
    mockSquads = [];

    mockGetDoc.mockImplementation(async (ref) => {
      const path = ref?._path || '';
      if (path.includes('shared_squads/SQ-ABC123')) {
        return {
          exists: () => true,
          data: () => ({
            squadCode: 'SQ-ABC123',
            squadName: 'Iron Temple Bros',
            memberLimit: 5,
            members: [],
            memberUids: [],
          }),
        };
      }
      return { exists: () => false };
    });

    renderSquad();

    const joinCodeInput = await screen.findByPlaceholderText('e.g. SQ-ABC123');
    fireEvent.change(joinCodeInput, { target: { value: 'SQ-ABC123' } });

    const joinBtn = screen.getByRole('button', { name: 'Join Squad' });
    fireEvent.click(joinBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('handles leaving a squad successfully', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
        creatorUid: 'uid-test-123',
      }),
    }];

    renderSquad();

    const leaveBtn = await screen.findByRole('button', { name: /Leave Squad/i });
    fireEvent.click(leaveBtn);

    // Wait for the custom confirmation dialog and click "Confirm"
    const confirmBtn = await screen.findByRole('button', { name: /Confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteDoc).toHaveBeenCalled();
    });
  });

  it('handles check-in successfully', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
      }),
    }];

    renderSquad();

    const checkInBtn = await screen.findByRole('button', { name: "I'm Going" });
    fireEvent.click(checkInBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('handles creating a poll successfully', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
      }),
    }];

    renderSquad();

    const pollQuestionInput = await screen.findByPlaceholderText('e.g. When are we hitting chest tomorrow?');
    fireEvent.change(pollQuestionInput, { target: { value: 'Hit chest tomorrow?' } });

    const launchPollBtn = screen.getByRole('button', { name: 'Launch Poll' });
    fireEvent.click(launchPollBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('handles voting on a poll successfully', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
      }),
    }];

    mockPolls = [{
      id: 'poll-123',
      data: () => ({
        question: 'Chest time?',
        options: ['07:00', '18:00'],
        votes: {},
        status: 'active',
        creatorUid: 'other-uid',
        creatorName: 'Aarav Patel',
      }),
    }];

    renderSquad();

    const optionBtn = await screen.findByRole('button', { name: /07:00/ });
    fireEvent.click(optionBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('handles generating a squad challenge successfully', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
        creatorUid: 'uid-test-123',
      }),
    }];

    callZenkaiAPI.mockResolvedValue({ data: { success: true } });

    renderSquad();

    const generateBtn = await screen.findByRole('button', { name: /Generate AI Synergy Challenge/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(callZenkaiAPI).toHaveBeenCalledWith('generateSquadChallenge', { squadCode: 'SQ-TEST' });
    });
  });

  it('handles voting to regenerate challenge successfully', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
        activeChallenge: {
          title: 'Chest Crusher',
          status: 'active',
        },
        hasRegeneratedThisWeek: false,
        regenerationVotes: [],
      }),
    }];

    renderSquad();

    const regenBtn = await screen.findByRole('button', { name: /Vote to Regenerate/i });
    fireEvent.click(regenBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('handles claiming reward successfully', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
        activeChallenge: {
          title: 'Chest Crusher',
          status: 'completed',
          rewardType: 'bossFightKey',
          rewardName: 'Boss Fight Key',
          claimedBy: {},
        },
      }),
    }];

    renderSquad();

    const claimBtn = await screen.findByRole('button', { name: /Claim Boss Fight Key!/i });
    fireEvent.click(claimBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('renders Command War Room features and trajectory chart', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
      }),
    }];

    renderSquad();

    const warroomTab = await screen.findByText(/🛡️ Command War Room/i);
    fireEvent.click(warroomTab);

    await waitFor(() => {
      expect(screen.getByText(/Squad Weekly Trajectory/i)).toBeInTheDocument();
      expect(screen.getByText(/0 Members Inactive/i)).toBeInTheDocument();
    });
  });

  it('opens scout modal and closes it successfully', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
      }),
    }];

    mockFreeAgents = [{
      data: () => ({
        uid: 'agent-bob',
        name: 'Bob Builder',
        squadCode: 'FIT-BOBB123',
        consistency: 85,
        squatPR: 160,
        benchPR: 100,
        goal: 'Strength',
        streak: 10,
        level: 5,
        volume: 5000,
        lookingForSquad: true,
        gymId: 'test_gym',
      }),
    }];

    renderSquad();

    const draftTab = await screen.findByText(/💸 Moneyball Draft/i);
    fireEvent.click(draftTab);

    const scoutBtn = await screen.findByRole('button', { name: 'Scout' });
    fireEvent.click(scoutBtn);

    await waitFor(() => {
      expect(screen.getByText('Athlete Scouting Card')).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Athlete Scouting Card')).not.toBeInTheDocument();
    });
  });

  it('opens scout modal and drafts agent successfully', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
      }),
    }];

    mockFreeAgents = [{
      data: () => ({
        uid: 'agent-bob',
        name: 'Bob Builder',
        squadCode: 'FIT-BOBB123',
        consistency: 85,
        squatPR: 160,
        benchPR: 100,
        goal: 'Strength',
        streak: 10,
        level: 5,
        volume: 5000,
        lookingForSquad: true,
        gymId: 'test_gym',
      }),
    }];

    renderSquad();

    const draftTab = await screen.findByText(/💸 Moneyball Draft/i);
    fireEvent.click(draftTab);

    const scoutBtn = await screen.findByRole('button', { name: 'Scout' });
    fireEvent.click(scoutBtn);

    await waitFor(() => {
      expect(screen.getByText('Athlete Scouting Card')).toBeInTheDocument();
    });

    const draftAgentBtn = screen.getByRole('button', { name: 'Draft Agent' });
    fireEvent.click(draftAgentBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('handles sorting of free agents correctly', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123'],
        members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
      }),
    }];

    mockFreeAgents = [
      {
        data: () => ({
          uid: 'agent-bob',
          name: 'Bob Builder',
          squadCode: 'FIT-BOBB123',
          consistency: 85,
          squatPR: 160,
          benchPR: 100,
          goal: 'Strength',
          streak: 10,
          level: 5,
          volume: 5000,
          lookingForSquad: true,
          gymId: 'test_gym',
        }),
      },
      {
        data: () => ({
          uid: 'agent-alice',
          name: 'Alice Cooper',
          squadCode: 'FIT-ALIC123',
          consistency: 90,
          squatPR: 180,
          benchPR: 110,
          goal: 'Strength',
          streak: 15,
          level: 6,
          volume: 6000,
          lookingForSquad: true,
          gymId: 'test_gym',
        }),
      }
    ];

    renderSquad();

    const draftTab = await screen.findByText(/💸 Moneyball Draft/i);
    fireEvent.click(draftTab);

    const squatSortBtn = await screen.findByRole('button', { name: /Squat PR/i });
    fireEvent.click(squatSortBtn);
    fireEvent.click(squatSortBtn);

    const benchSortBtn = screen.getByRole('button', { name: /Bench PR/i });
    fireEvent.click(benchSortBtn);

    await waitFor(() => {
      expect(screen.getByText('Alice Cooper')).toBeInTheDocument();
      expect(screen.getByText('Bob Builder')).toBeInTheDocument();
    });
  });

  it('opens trade modal and confirms trade successfully when squad is at capacity', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 2,
        memberUids: ['uid-test-123', 'uid-other-999', 'uid-other-888'],
        members: [
          { uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' },
          { uid: 'uid-other-999', name: 'John Doe', squadCode: 'FIT-JOHN999', streak: 5, volume: 1000 },
          { uid: 'uid-other-888', name: 'Jane Doe', squadCode: 'FIT-JANE888', streak: 10, volume: 2000 }
        ],
        creatorUid: 'uid-test-123',
      }),
    }];

    mockFreeAgents = [{
      data: () => ({
        uid: 'agent-bob',
        name: 'Bob Builder',
        squadCode: 'FIT-BOBB123',
        consistency: 85,
        squatPR: 160,
        benchPR: 100,
        goal: 'Strength',
        streak: 10,
        level: 5,
        volume: 5000,
        lookingForSquad: true,
        gymId: 'test_gym',
      }),
    }];

    renderSquad();

    const draftTab = await screen.findByText(/💸 Moneyball Draft/i);
    fireEvent.click(draftTab);

    const draftBtn = await screen.findByRole('button', { name: 'Draft' });
    fireEvent.click(draftBtn);

    await waitFor(() => {
      expect(screen.getByText('Confirm Trade')).toBeInTheDocument();
    });

    const select = screen.getByText('Select Teammate to Release').parentElement.querySelector('select');
    fireEvent.change(select, { target: { value: 'uid-other-888' } });

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText('Confirm Trade')).not.toBeInTheDocument();
    });

    const draftBtn2 = screen.getByRole('button', { name: 'Draft' });
    fireEvent.click(draftBtn2);

    await waitFor(() => {
      expect(screen.getByText('Confirm Trade')).toBeInTheDocument();
    });

    const confirmTradeBtn = screen.getByRole('button', { name: 'Confirm Trade' });
    fireEvent.click(confirmTradeBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('handles gym check-in selection, copying squad code, and nudging inactive members', async () => {
    // Setup navigator clipboard mock
    const originalClipboard = navigator.clipboard;
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
      configurable: true,
    });

    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123', 'uid-other-999'],
        members: [
          { uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' },
          { uid: 'uid-other-999', name: 'Bob Builder', squadCode: 'FIT-BOBB123' }
        ],
        creatorUid: 'uid-test-123',
      }),
    }];

    renderSquad();

    // Wait for the active squad rendering
    await waitFor(() => {
      expect(screen.getAllByText(/Iron Temple Bros/i).length).toBeGreaterThan(0);
    });

    // 1. Change Gym Check-In Time
    const select = screen.getByText('Check In Gym Time Today').parentElement.querySelector('select');
    fireEvent.change(select, { target: { value: '09:00' } });
    expect(select.value).toBe('09:00');

    // Submit check-in
    const checkInBtn = screen.getByRole('button', { name: "I'm Going" });
    fireEvent.click(checkInBtn);
    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });

    // 2. Copy Squad Code
    const copyBtn = screen.getByRole('button', { name: /Code: SQ-TEST/i });
    fireEvent.click(copyBtn);
    expect(mockWriteText).toHaveBeenCalledWith('SQ-TEST');

    // Wait for the custom alert and click OK to dismiss it
    const okBtn = await screen.findByRole('button', { name: /OK/i });
    fireEvent.click(okBtn);

    // 3. Command Decay Warning & Nudge
    const warroomTab = screen.getByText(/🛡️ Command War Room/i);
    fireEvent.click(warroomTab);

    // Verify decay warning displays
    await waitFor(() => {
      expect(screen.getByText(/🚨 COMMAND DECAY WARNING/i)).toBeInTheDocument();
      expect(screen.getByText(/Bob Builder has missed check-ins/i)).toBeInTheDocument();
    });

    // Click Nudge Bros
    const nudgeBtn = screen.getByRole('button', { name: /Nudge Bros/i });
    fireEvent.click(nudgeBtn);

    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining("Yo Bob Builder! You've been MIA from our Zenkai gym squad")
    );
    expect(screen.getByText(/Nudge copied!/i)).toBeInTheDocument();

    // Restore clipboard
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true,
      });
    }
  });

  it('covers kicking a member, poll input onChange, and rendering gym check-in presence list', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123', 'uid-other-999'],
        members: [
          { uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' },
          { uid: 'uid-other-999', name: 'Bob Builder', squadCode: 'FIT-BOBB123' }
        ],
        creatorUid: 'uid-test-123',
      }),
    }];

    mockPresence = [{
      id: 'presence-bob',
      data: () => ({
        uid: 'uid-other-999',
        name: 'Bob Builder',
        time: '18:00',
      }),
    }];

    renderSquad();

    // Wait for squad rendering
    await waitFor(() => {
      expect(screen.getAllByText(/Iron Temple Bros/i).length).toBeGreaterThan(0);
    });

    // 1. Verify presence check-in list is rendered
    await waitFor(() => {
      expect(screen.getAllByText('Bob Builder').length).toBe(2);
      expect(screen.getByText('Going to Gym today at 18:00')).toBeInTheDocument();
    });

    // 2. Poll option input onChange
    const pollInput = screen.getByPlaceholderText('e.g. 06:00, 16:30, 18:00');
    fireEvent.change(pollInput, { target: { value: '08:00, 17:00' } });
    expect(pollInput.value).toBe('08:00, 17:00');

    // 3. Kick member
    const kickBtn = screen.getByTitle('Kick member');
    fireEvent.click(kickBtn);

    // Click Confirm on the custom dialog
    const confirmBtn = await screen.findByRole('button', { name: /Confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('renders Titan Raid PvE layout successfully and handles switcher and Create/Join New actions', async () => {
    mockSquads = [
      {
        data: () => ({
          squadCode: 'SQ-TEST',
          squadName: 'Iron Temple Bros',
          memberLimit: 5,
          memberUids: ['uid-test-123', 'uid-other-999'],
          members: [
            { uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' },
            { uid: 'uid-other-999', name: 'Bob Builder', squadCode: 'FIT-BOBB123' }
          ],
          creatorUid: 'uid-test-123',
          activeChallenge: {
            title: 'Titan Raid Boss Chest',
            description: 'Defeat the chest titan with daily benches',
            isTitanRaid: true,
            weakness: 'Bench Press',
            rewardName: 'Boss Fight Lootbox',
            currentHP: 0,
            totalHP: 10000,
            progress: {
              'uid-test-123': 5000,
              'uid-other-999': 5000,
            },
          },
        }),
      },
      {
        data: () => ({
          squadCode: 'SQ-OTHER',
          squadName: 'Other Squad',
          memberLimit: 5,
          memberUids: ['uid-test-123'],
          members: [{ uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' }],
          creatorUid: 'uid-test-123',
        }),
      }
    ];

    renderSquad();

    await waitFor(() => {
      expect(screen.getAllByText(/Iron Temple Bros/i).length).toBeGreaterThan(0);
    });

    expect(screen.getByText('Titan Raid Boss Chest')).toBeInTheDocument();
    expect(screen.getByText('⚡ TITAN SLAYED ⚡')).toBeInTheDocument();
    expect(screen.getAllByText('5,000 DMG').length).toBe(2);

    // 1. Switch accountability squad
    const switcher = screen.getByText('Switch Accountability Squad').parentElement.querySelector('select');
    fireEvent.change(switcher, { target: { value: 'SQ-OTHER' } });
    await waitFor(() => {
      expect(screen.getAllByText(/Other Squad/i).length).toBeGreaterThan(0);
    });

    // 2. Click Create/Join New
    const createJoinBtn = screen.getByRole('button', { name: 'Create/Join New' });
    fireEvent.click(createJoinBtn);
  });

  it('handles notification mute toggle and declining an invite', async () => {
    mockInvites = [{
      data: () => ({
        inviteId: 'invite-456',
        inviterUid: 'uid-other-999',
        inviterName: 'Aarav Patel',
        squadCode: 'SQ-OTHER',
        squadName: 'Gold Gym Elite',
        targetUid: 'uid-test-123',
        status: 'pending',
      }),
    }];

    renderSquad();

    // Wait for header to render
    await screen.findByText('Fantasy League Matchmaker');

    // 1. Notification mute toggle
    const muteBtn = screen.getByTitle('Mute Notifications');
    fireEvent.click(muteBtn);
    expect(muteBtn).toHaveAttribute('title', 'Unmute Notifications');
    expect(screen.getByText('Muted')).toBeInTheDocument();

    // Click again to unmute
    fireEvent.click(muteBtn);
    expect(muteBtn).toHaveAttribute('title', 'Mute Notifications');
    expect(screen.getByText('Alerts On')).toBeInTheDocument();

    // 2. Decline invite
    await waitFor(() => {
      expect(screen.getByText(/Pending Squad Invitations/i)).toBeInTheDocument();
    });

    const declineBtn = screen.getByRole('button', { name: 'Decline' });
    fireEvent.click(declineBtn);
    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalled();
    });
  });

  it('renders squad activity feed and triggers high-fives and kudos social actions', async () => {
    mockSquads = [{
      data: () => ({
        squadCode: 'SQ-TEST',
        squadName: 'Iron Temple Bros',
        memberLimit: 5,
        memberUids: ['uid-test-123', 'uid-other-999'],
        members: [
          { uid: 'uid-test-123', name: 'Priyanshu (You)', squadCode: 'FIT-PRIY123' },
          { uid: 'uid-other-999', name: 'Bob Builder', squadCode: 'FIT-BOBB123' }
        ],
        creatorUid: 'uid-test-123',
      }),
    }];

    mockActivityFeed = [{
      id: 'activity-123',
      data: () => ({
        uid: 'uid-other-999',
        name: 'Bob Builder',
        workoutName: 'Workout: push_day',
        isQuickLog: false,
        exercisesCount: 4,
        totalSets: 12,
        totalVolume: 5000,
        prNames: ['Bench Press'],
        cardTheme: 'pr_smash',
        highFives: [],
        kudos: [],
        createdAt: new Date(),
      }),
    }];

    renderSquad();

    // Verify activity feed item is rendered
    await waitFor(() => {
      expect(screen.getByText('Squad Activity Feed')).toBeInTheDocument();
      expect(screen.getByText('Workout: push_day')).toBeInTheDocument();
      expect(screen.getByText('0 High-Fives')).toBeInTheDocument();
      expect(screen.getByText('0 Kudos')).toBeInTheDocument();
    });

    // Click High-Five reaction
    const highFiveBtn = screen.getByRole('button', { name: /High-Fives/i });
    fireEvent.click(highFiveBtn);

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });
});
