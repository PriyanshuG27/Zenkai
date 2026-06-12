import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Import mocks first to ensure they run vi.mock before component files are loaded
import {
  mockAuth,
  mockGetDocs,
  mockDeleteDoc,
  mockUpdateDoc,
  mockGetDoc,
} from '../__mocks__/firebase';

import MobileProfile from '../components/mobile/MobileProfile';
import DesktopProfile from '../components/desktop/DesktopProfile';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/useUIStore';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Account Data Reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = { uid: 'test-user-uid' };
    
    // Set mock resolved value for getDocs so queries on mount do not crash
    mockGetDocs.mockResolvedValue({
      docs: [
        { 
          id: 'doc1', 
          ref: { _path: 'users/test-user-uid/sessions/doc1' },
          data: () => ({
            totalVolume: 1000,
            xpEarned: 20,
            date: new Date().toISOString()
          })
        },
      ]
    });

    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        name: 'Zenkai Athlete',
        xp: 1500,
        level: 5,
        streak: 12,
        onboardingComplete: true,
      })
    });

    useAuthStore.setState({
      user: { uid: 'test-user-uid' },
      uid: 'test-user-uid',
      profile: {
        name: 'Zenkai Athlete',
        email: 'athlete@zenkai.com',
        onboardingComplete: true,
        equipmentList: ['Barbell'],
        xp: 1500,
        level: 5,
        streak: 12
      }
    });
    
    useUIStore.setState({
      addToast: vi.fn(),
    });
  });

  describe('MobileProfile Danger Zone & Reset Modal', () => {
    it('requires 2-step confirmation and cleans up Firestore data, local plan store, and redirects', async () => {
      render(
        <MemoryRouter>
          <MobileProfile />
        </MemoryRouter>
      );

      // Verify "Reset Account Data" button is present under Danger Zone
      const resetTriggerBtn = screen.getByRole('button', { name: /Reset Account Data/i });
      expect(resetTriggerBtn).toBeInTheDocument();

      // Step 1: Open Reset Modal
      fireEvent.click(resetTriggerBtn);
      expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument();

      // Check that "Continue to final step" button is disabled initially
      expect(screen.getByRole('button', { name: /CONTINUE TO FINAL STEP/i })).toBeDisabled();

      // Type incorrect text
      let textInput = screen.getByPlaceholderText('RESET');
      fireEvent.change(textInput, { target: { value: 'NOTRESET' } });
      expect(screen.getByRole('button', { name: /CONTINUE TO FINAL STEP/i })).toBeDisabled();

      // Type correct text (re-query first to get the fresh reference after re-render)
      textInput = screen.getByPlaceholderText('RESET');
      fireEvent.change(textInput, { target: { value: 'RESET' } });
      
      // Wait for button to be enabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /CONTINUE TO FINAL STEP/i })).not.toBeDisabled();
      });

      // Go to Step 2
      fireEvent.click(screen.getByRole('button', { name: /CONTINUE TO FINAL STEP/i }));
      expect(screen.getByText(/Step 2 of 2/i)).toBeInTheDocument();

      // Verify "Wipe My Data" button is disabled until checking the checkbox
      expect(screen.getByRole('button', { name: /WIPE MY DATA/i })).toBeDisabled();

      // Check the checkbox
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      
      // Wait for button to be enabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /WIPE MY DATA/i })).not.toBeDisabled();
      });

      // Setup final mock getDoc for profile refresh
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          name: 'Zenkai Athlete',
          xp: 0,
          level: 1,
          onboardingComplete: false,
        })
      });

      // Click "Wipe My Data" and verify execution
      fireEvent.click(screen.getByRole('button', { name: /WIPE MY DATA/i }));

      await waitFor(() => {
        // Verify deleteDoc was called for subcollections
        expect(mockDeleteDoc).toHaveBeenCalled();
        // Verify updateDoc was called on user profile doc
        expect(mockUpdateDoc).toHaveBeenCalled();
        // Verify store was cleared & updated
        expect(useAuthStore.getState().profile.xp).toBe(0);
        expect(useAuthStore.getState().profile.level).toBe(1);
        // Verify redirection
        expect(mockNavigate).toHaveBeenCalledWith('/onboarding/type', { replace: true });
      });
    });
  });

  describe('DesktopProfile Danger Zone & Reset Modal', () => {
    it('requires 2-step confirmation and cleans up Firestore data, local plan store, and redirects', async () => {
      render(
        <MemoryRouter>
          <DesktopProfile />
        </MemoryRouter>
      );

      // Verify "Reset Account Data" button is present under Danger Zone
      const resetTriggerBtn = screen.getByRole('button', { name: /Reset Account Data/i });
      expect(resetTriggerBtn).toBeInTheDocument();

      // Step 1: Open Reset Modal
      fireEvent.click(resetTriggerBtn);
      expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument();

      // Check that "Continue to final step" button is disabled initially
      expect(screen.getByRole('button', { name: /CONTINUE TO FINAL STEP/i })).toBeDisabled();

      // Type correct text
      let textInput = screen.getByPlaceholderText('RESET');
      fireEvent.change(textInput, { target: { value: 'RESET' } });
      
      // Wait for button to be enabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /CONTINUE TO FINAL STEP/i })).not.toBeDisabled();
      });

      // Go to Step 2
      fireEvent.click(screen.getByRole('button', { name: /CONTINUE TO FINAL STEP/i }));
      expect(screen.getByText(/Step 2 of 2/i)).toBeInTheDocument();

      // Verify "Wipe My Data" button is disabled until checking the checkbox
      expect(screen.getByRole('button', { name: /WIPE MY DATA/i })).toBeDisabled();

      // Check the checkbox
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      
      // Wait for button to be enabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /WIPE MY DATA/i })).not.toBeDisabled();
      });

      // Setup final mock getDoc for profile refresh
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          name: 'Zenkai Athlete',
          xp: 0,
          level: 1,
          onboardingComplete: false,
        })
      });

      // Click "Wipe My Data" and verify execution
      fireEvent.click(screen.getByRole('button', { name: /WIPE MY DATA/i }));

      await waitFor(() => {
        // Verify deleteDoc was called for subcollections
        expect(mockDeleteDoc).toHaveBeenCalled();
        // Verify updateDoc was called on user profile doc
        expect(mockUpdateDoc).toHaveBeenCalled();
        // Verify store was cleared & updated
        expect(useAuthStore.getState().profile.xp).toBe(0);
        expect(useAuthStore.getState().profile.level).toBe(1);
        // Verify redirection
        expect(mockNavigate).toHaveBeenCalledWith('/onboarding/type', { replace: true });
      });
    });
  });
});
