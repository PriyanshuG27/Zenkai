import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Camera, Shield, FileText, User } from 'lucide-react';
import { EQUIPMENT_CATEGORIES, MEDICAL_CATEGORIES } from '../../../lib/constants';
import { PushNotificationToggle } from './PushNotificationToggle';

export const EditProfileModal = (props) => {
  const {
    isEditModalOpen, setIsEditModalOpen, activeSettingsTab, setActiveSettingsTab,
    profile, editEquipment, setEditEquipment, editMedicalFlags, setEditMedicalFlags,
    editGymName, setEditGymName, editDisableRestTimer, setEditDisableRestTimer,
    isSavingSettings, handleSaveSettings,
    isPushEnabled, enablePushNotifications, disablePushNotifications
  } = props;

  return (
    <>
      {/* ─── EDIT EQUIPMENT & HEALTH MODAL ────────────────────────────── */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
            {/* Backdrop Close */}
            <div className="absolute inset-0 cursor-pointer" onClick={() => setIsEditModalOpen(false)} />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-[#111111] border-2 border-black rounded-lg p-5 w-full max-w-md max-h-[85vh] overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,1)] relative flex flex-col gap-4 text-white z-10"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-4 right-4 text-xs text-[var(--text-secondary)] hover:text-white transition-all bg-transparent border-none cursor-pointer"
              >
                <X size={20} />
              </button>

              {/* Modal Header */}
              <div className="flex items-center gap-3 border-b-2 border-[#222222] pb-3">
                <div className="p-2 rounded bg-[#a78bfa0e] border border-[#a78bfa] text-[#a78bfa] shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                  <User size={20} />
                </div>
                <div className="flex flex-col">
                  <span className="font-display font-extrabold text-lg uppercase tracking-wide leading-none">
                    Edit Setup
                  </span>
                  <span className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider mt-1">
                    Equipment & Restrictions
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-2 border-black rounded overflow-hidden shrink-0">
                <button
                  onClick={() => setActiveSettingsTab('equipment')}
                  className={`flex-1 py-2 font-display text-xs font-bold uppercase tracking-wider transition-all ${
                    activeSettingsTab === 'equipment'
                      ? 'bg-[var(--primary)] text-black font-black'
                      : 'bg-[var(--surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  Equipment
                </button>
                <button
                  onClick={() => setActiveSettingsTab('health')}
                  className={`flex-1 py-2 font-display text-xs font-bold uppercase tracking-wider transition-all ${
                    activeSettingsTab === 'health'
                      ? 'bg-[#ef4444] text-black font-black'
                      : 'bg-[var(--surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  Health
                </button>
                <button
                  onClick={() => setActiveSettingsTab('gym')}
                  className={`flex-1 py-2 font-display text-xs font-bold uppercase tracking-wider transition-all ${
                    activeSettingsTab === 'gym'
                      ? 'bg-[var(--secondary)] text-black font-black'
                      : 'bg-[var(--surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  Gym & App
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 font-sans text-sm scrollbar-none my-2">
                {activeSettingsTab === 'gym' ? (
                  <div className="flex flex-col gap-4">
                    {/* Home Gym Tagging */}
                    <div className="border-2 border-black bg-[#161616] p-4 rounded flex flex-col gap-3 shadow-[2px_2px_0px_rgba(0,0,0,0.5)]">
                      <span className="text-xs font-bold text-white uppercase tracking-wider font-display border-b border-[#222] pb-1">
                        Home Gym Tagging
                      </span>
                      <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed">
                        Tag your local branch to unlock localized leaderboard competitions with other local lifters.
                      </p>
                      <div className="flex flex-col gap-1 mt-2">
                        <label className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider">
                          Gym Name
                        </label>
                        <input
                          type="text"
                          value={editGymName}
                          onChange={(e) => setEditGymName(e.target.value)}
                          placeholder="e.g. Gold's Gym Koramangala"
                          className="w-full bg-[#1a1a1a] text-white text-xs p-3 rounded border border-[#2c2c2c] focus:outline-none focus:border-[var(--primary)] font-sans mt-1"
                        />
                      </div>
                      {editGymName.trim() && (
                        <div className="mt-1 bg-black/40 border border-[#222] p-2.5 rounded text-[10px] font-mono text-[var(--text-secondary)]">
                          COMPUTED ID: <span className="text-[var(--primary)] font-bold">{editGymName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_+|_+$)/g, '')}</span>
                        </div>
                      )}
                    </div>

                    {/* App Preferences */}
                    <div className="border-2 border-black bg-[#161616] p-4 rounded flex flex-col gap-3 shadow-[2px_2px_0px_rgba(0,0,0,0.5)]">
                      <span className="text-xs font-bold text-white uppercase tracking-wider font-display border-b border-[#222] pb-1">
                        App Preferences
                      </span>
                      <p className="text-[10px] text-[var(--text-secondary)] font-sans leading-relaxed">
                        Customize your workout logger experience.
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditDisableRestTimer(prev => !prev)}
                        className="flex items-center justify-between text-left mt-2 min-h-[44px] w-full focus:outline-none"
                      >
                        <div className="flex flex-col pr-2">
                          <span className="text-xs font-bold text-white">Disable Rest Timer</span>
                          <span className="text-[9px] text-[var(--text-secondary)] mt-0.5">
                            Do not start a countdown when marking a set as done.
                          </span>
                        </div>
                        <div
                          className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 border border-[var(--border-bright)] shrink-0 ${
                            editDisableRestTimer ? 'bg-[var(--secondary)] text-black' : 'bg-[#1a1a1a]'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                              editDisableRestTimer ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </div>
                      </button>
                    </div>
                  </div>
                ) : activeSettingsTab === 'equipment' ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center bg-[#1a1a1a] p-2.5 rounded border border-[#222222]">
                      <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">Quick Actions</span>
                      <button
                        onClick={() => {
                          const allItems = EQUIPMENT_CATEGORIES.flatMap(cat => cat.items);
                          setEditEquipment(all => all.length === allItems.length ? [] : allItems);
                        }}
                        className="px-3 py-1 text-[10px] font-display uppercase font-bold border-2 border-black bg-[var(--secondary)] text-black rounded shadow-[2px_2px_0px_rgba(0,0,0,1)] active:scale-95 transition-all"
                      >
                        {editEquipment.length === EQUIPMENT_CATEGORIES.flatMap(cat => cat.items).length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    
                    {EQUIPMENT_CATEGORIES.map((cat) => (
                      <div key={cat.label} className="border-2 border-black bg-[#161616] p-3 rounded flex flex-col gap-2 shadow-[2px_2px_0px_rgba(0,0,0,0.5)]">
                        <span className="text-[11px] font-bold text-white uppercase tracking-wider font-display border-b border-[#222] pb-1">
                          {cat.label}
                        </span>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          {cat.items.map((item) => {
                            const isSelected = editEquipment.includes(item);
                            return (
                              <button
                                key={item}
                                onClick={() => {
                                  setEditEquipment(prev =>
                                    prev.includes(item)
                                      ? prev.filter(i => i !== item)
                                      : [...prev, item]
                                  );
                                }}
                                className={`px-2 py-1.5 rounded text-[10px] font-sans font-bold border text-left flex items-center justify-between transition-all ${
                                  isSelected
                                    ? 'bg-[#b5ff2d1c] text-[var(--accent-xp)] border-[var(--accent-xp)]'
                                    : 'bg-[#1a1a1a] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
                                }`}
                              >
                                <span className="truncate pr-1">{item}</span>
                                {isSelected && <Check size={10} className="shrink-0 text-[var(--accent-xp)]" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {MEDICAL_CATEGORIES.map((cat) => (
                      <div key={cat.label} className="border-2 border-black bg-[#161616] p-3 rounded flex flex-col gap-2 shadow-[2px_2px_0px_rgba(0,0,0,0.5)]">
                        <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider font-display border-b border-[#222] pb-1">
                          {cat.label}
                        </span>
                        <div className="flex flex-col gap-2 mt-1">
                          {cat.items.map((flag) => {
                            const isSelected = editMedicalFlags.includes(flag.key);
                            return (
                              <button
                                key={flag.key}
                                onClick={() => {
                                  setEditMedicalFlags(prev =>
                                    prev.includes(flag.key)
                                      ? prev.filter(f => f !== flag.key)
                                      : [...prev, flag.key]
                                  );
                                }}
                                className={`p-2 rounded text-left border flex items-start justify-between gap-3 transition-all ${
                                  isSelected
                                    ? 'bg-[#ef444413] text-red-400 border-red-500'
                                    : 'bg-[#1a1a1a] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
                                }`}
                              >
                                <div className="flex flex-col min-w-0">
                                  <span className={`text-[11px] font-bold ${isSelected ? 'text-red-400' : 'text-white'}`}>
                                    {flag.key}
                                  </span>
                                  <span className="text-[9px] text-[var(--text-muted)] mt-0.5 leading-tight font-normal">
                                    {flag.desc}
                                  </span>
                                </div>
                                {isSelected && <Check size={12} className="shrink-0 text-red-500 mt-0.5" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3 mt-1 pt-3 border-t border-[#222] shrink-0">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-2.5 bg-transparent text-[var(--text-secondary)] hover:text-white border-2 border-[#222222] rounded text-xs font-mono font-bold tracking-wider hover:border-[#333333] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                  className="flex-1 py-2.5 bg-[var(--primary)] text-black font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  {isSavingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </>
  );
};
