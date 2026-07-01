import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronUp, Plus, Camera, ArrowLeft, ThumbsUp, ThumbsDown, MessageSquare, Trash2, Check } from 'lucide-react';
import { getAvatarStyle } from '../../../lib/xpHelpers';

export const FeedbackModal = (props) => {
  const {
    isFeatureModalOpen, setIsFeatureModalOpen, isAddingFeedback, setIsAddingFeedback,
    feedbackType, setFeedbackType, feedbackTitle, setFeedbackTitle, feedbackText, setFeedbackText,
    feedbackScreenshot, handleScreenshotUpload, isCompressingScreenshot, setFeedbackScreenshot,
    isSubmittingFeedback, handleFeedbackSubmit, filterStatus, setFilterStatus, sortBy, setSortBy,
    feedbackList, expandedFeedbackId, setExpandedFeedbackId, handleVote, handleUpdateStatus,
    handleDeleteFeedback, setActiveScreenshotViewer, uid, profile
  } = props;

  // Local state for comments
  const [commentInputs, setCommentInputs] = useState({});

  return (
    <>
      {/* ─── REQUEST A FEATURE / FEEDBACK MODAL ────────────────────────────── */}
      {/* ─── REQUEST A FEATURE / FEEDBACK MODAL ────────────────────────────── */}
      <AnimatePresence>
        {isFeatureModalOpen && (
          <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
            {/* Backdrop Close */}
            <div className="absolute inset-0 cursor-pointer" onClick={() => setIsFeatureModalOpen(false)} />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-[#111111] border-2 border-black rounded-lg p-5 w-full max-w-lg h-[80vh] overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,1)] relative flex flex-col gap-4 text-white z-10"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsFeatureModalOpen(false)}
                className="absolute top-4 right-4 text-xs text-[var(--text-secondary)] hover:text-white transition-all bg-transparent border-none cursor-pointer"
              >
                <X size={20} />
              </button>

              {/* Modal Header */}
              <div className="flex items-center gap-3 border-b-2 border-[#222222] pb-3 shrink-0">
                {isAddingFeedback ? (
                  <button
                    onClick={() => setIsAddingFeedback(false)}
                    className="p-1.5 rounded bg-[#1a1a1a] border border-[#2c2c2c] text-[var(--text-secondary)] hover:text-white cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                  </button>
                ) : (
                  <div className="p-2 rounded bg-[#00d4ff0e] border border-[var(--secondary)] text-[var(--secondary)] shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                    <MessageSquare size={20} />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="font-display font-extrabold text-lg uppercase tracking-wide leading-none">
                    {isAddingFeedback ? 'Add Suggestion' : 'Feedback Board'}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider mt-1">
                    {isAddingFeedback ? 'Submit a new feature or bug' : 'What the community wants'}
                  </span>
                </div>
                {!isAddingFeedback && (
                  <button
                    onClick={() => setIsAddingFeedback(true)}
                    className="ml-auto px-2.5 py-1.5 bg-[var(--secondary)] text-black font-display font-extrabold text-[10px] uppercase tracking-wider rounded border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} /> Add
                  </button>
                )}
              </div>

              {isAddingFeedback ? (
                /* ─── ADD SUGGESTION FORM VIEW ─── */
                <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 font-sans text-sm scrollbar-none my-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider">
                      Suggestion Title
                    </label>
                    <input
                      type="text"
                      value={feedbackTitle}
                      onChange={(e) => setFeedbackTitle(e.target.value)}
                      placeholder="e.g. Add Calf Raise exercises"
                      maxLength={80}
                      className="w-full bg-[#1a1a1a] text-white text-xs p-3 rounded border border-[#2c2c2c] focus:outline-none focus:border-[var(--secondary)] font-sans mt-1"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider">
                      Feedback Category
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {['Suggest an Exercise', 'Feature Request', 'Bug Report', 'Other'].map((type) => {
                        const isSelected = feedbackType === type;
                        return (
                          <button
                            key={type}
                            onClick={() => setFeedbackType(type)}
                            className={`px-2 py-2 rounded text-[10px] font-sans font-bold border text-left flex items-center justify-between transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#00d4ff1c] text-[var(--secondary)] border-[var(--secondary)]'
                                : 'bg-[#1a1a1a] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
                            }`}
                          >
                            <span>{type}</span>
                            {isSelected && <Check size={10} className="shrink-0 text-[var(--secondary)]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-2">
                    <label className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider">
                      Detailed Explanation
                    </label>
                    <textarea
                      rows={5}
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Describe your request, problem, or suggestion in detail..."
                      className="w-full bg-[#1a1a1a] text-white text-xs p-3 rounded border border-[#2c2c2c] focus:outline-none focus:border-[var(--secondary)] font-sans mt-1 resize-none"
                    />
                  </div>

                  {/* Screenshot Upload Section */}
                  <div className="flex flex-col gap-1.5 mt-1">
                    <label className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider">
                      Attach Screenshot (Optional)
                    </label>
                    
                    {feedbackScreenshot ? (
                      <div className="relative w-24 h-24 border-2 border-black rounded overflow-hidden shadow-[2px_2px_0px_rgba(0,0,0,1)] group mt-1">
                        <img src={`data:image/jpeg;base64,${feedbackScreenshot}`} alt="Feedback Screenshot" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setFeedbackScreenshot(null)}
                          className="absolute top-1 right-1 p-1 bg-black/80 hover:bg-black text-white rounded-full border border-[#333] transition-all cursor-pointer flex items-center justify-center"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-1">
                        {isCompressingScreenshot ? (
                          <div className="w-full py-2 border-2 border-black bg-[#1a1a1a] text-[var(--text-secondary)] font-mono text-xs uppercase tracking-wider text-center flex justify-center items-center gap-2 cursor-not-allowed opacity-75">
                            <span className="h-3 w-3 border-2 border-[var(--secondary)] border-t-transparent rounded-full animate-spin" />
                            <span>Compressing Image...</span>
                          </div>
                        ) : (
                          <>
                            <label
                              htmlFor="feedback-screenshot"
                              className="w-full py-2 border-2 border-black bg-[#1c1c1c] hover:bg-[#2c2c2c] text-[var(--text-secondary)] hover:text-white font-mono text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all text-center flex justify-center items-center gap-2 cursor-pointer"
                            >
                              <Camera size={14} />
                              <span>Choose Screenshot</span>
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              id="feedback-screenshot"
                              className="hidden"
                              onChange={handleScreenshotUpload}
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Form Footer */}
                  <div className="flex gap-3 mt-auto pt-3 border-t border-[#222] shrink-0">
                    <button
                      onClick={() => setIsAddingFeedback(false)}
                      className="flex-1 py-2 bg-transparent text-[var(--text-secondary)] hover:text-white border-2 border-[#222222] rounded text-xs font-mono font-bold tracking-wider hover:border-[#333333] transition-all cursor-pointer"
                    >
                      Back to Board
                    </button>
                    <button
                      onClick={handleFeedbackSubmit}
                      disabled={isSubmittingFeedback}
                      className="flex-1 py-2 bg-[var(--secondary)] text-black font-display font-extrabold tracking-widest text-xs uppercase rounded border-2 border-black shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isSubmittingFeedback ? 'Submitting...' : 'Submit'}
                    </button>
                  </div>
                </div>
              ) : (
                /* ─── FEEDBACK LIST VIEW ─── */
                <div className="flex-1 flex flex-col gap-3 min-h-0">
                  {/* Filters and Sorting */}
                  <div className="flex flex-col gap-2 shrink-0 bg-[#151515] p-2.5 rounded border border-[#222]">
                    {/* Status Filter Chips */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      {['All', 'Future Plans', 'In Progress', 'Done'].map((status) => {
                        const isSelected = filterStatus === status;
                        return (
                          <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-bold border transition-all cursor-pointer whitespace-nowrap ${
                              isSelected
                                ? 'bg-[var(--secondary)] text-black border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]'
                                : 'bg-[#1a1a1a] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
                            }`}
                          >
                            {status}
                          </button>
                        );
                      })}
                    </div>

                    {/* Sorting selector */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-secondary)] mt-1">
                      <span>Sort By</span>
                      <div className="flex gap-2">
                        {['Most Liked', 'Recent'].map((opt) => {
                          const isSel = sortBy === opt;
                          return (
                            <button
                              key={opt}
                              onClick={() => setSortBy(opt)}
                              className={`bg-transparent border-none font-bold cursor-pointer transition-all ${
                                isSel ? 'text-[var(--secondary)] underline' : 'text-[var(--text-secondary)] hover:text-white'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Scrollable list of cards */}
                  <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 scrollbar-none">
                    {feedbackList.length === 0 ? (
                      <div className="text-center py-8 text-[var(--text-secondary)] font-sans text-xs">
                        No feedback items found. Be the first to suggest something! 🚀
                      </div>
                    ) : (
                      (() => {
                        // Filter & Sort logic
                        const filtered = feedbackList.filter(item => {
                          if (filterStatus === 'All') return true;
                          return item.status === filterStatus;
                        });

                        const sorted = [...filtered].sort((a, b) => {
                          if (sortBy === 'Recent') {
                            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                          } else {
                            // Most Liked (score = upvotes - downvotes)
                            const scoreA = (a.upvotes || []).length - (a.downvotes || []).length;
                            const scoreB = (b.upvotes || []).length - (b.downvotes || []).length;
                            if (scoreA !== scoreB) return scoreB - scoreA;
                            // Fallback to date if score matches
                            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                          }
                        });

                        if (sorted.length === 0) {
                          return (
                            <div className="text-center py-8 text-[var(--text-secondary)] font-mono text-xs uppercase">
                              No {filterStatus} items yet
                            </div>
                          );
                        }

                        return sorted.map((item) => {
                          const isExpanded = expandedFeedbackId === item.id;
                          const upvotes = item.upvotes || [];
                          const downvotes = item.downvotes || [];
                          const netScore = upvotes.length - downvotes.length;
                          const hasUpvoted = upvotes.includes(uid);
                          const hasDownvoted = downvotes.includes(uid);

                          return (
                            <div
                              key={item.id}
                              className="bg-[#181818] border-2 border-black rounded p-3 flex flex-col gap-2"
                              style={{
                                boxShadow: isExpanded ? 'none' : '4px 4px 0px rgba(0,0,0,1)',
                                transform: isExpanded ? 'translate(2px, 2px)' : 'none',
                                transition: 'all 0.15s ease-out'
                              }}
                            >
                              {/* Top Bar: Category & Status Badges */}
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#2c2c2c] border border-[#3c3c3c] text-slate-300 font-bold">
                                  {item.category}
                                </span>

                                <span
                                  className={`text-[8px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wide font-extrabold ${
                                    item.status === 'Done'
                                      ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900'
                                      : item.status === 'In Progress'
                                      ? 'bg-amber-950/20 text-amber-400 border-amber-900'
                                      : 'bg-purple-950/20 text-purple-400 border-purple-900'
                                  }`}
                                >
                                  {item.status}
                                </span>
                              </div>

                              {/* Title (Clickable to expand) */}
                              <div className="flex items-start justify-between gap-3 mt-1">
                                <div
                                  onClick={() => setExpandedFeedbackId(isExpanded ? null : item.id)}
                                  className="font-display font-extrabold text-sm uppercase tracking-wide hover:text-[var(--secondary)] transition-all cursor-pointer flex-1 text-white leading-tight mt-0.5"
                                >
                                  {item.title}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {item.screenshot && !isExpanded && (
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveScreenshotViewer(`data:image/jpeg;base64,${item.screenshot}`);
                                      }}
                                      className="w-10 h-10 border border-black rounded overflow-hidden shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 cursor-pointer transition-all shrink-0"
                                    >
                                      <img
                                        src={`data:image/jpeg;base64,${item.screenshot}`}
                                        alt="Screenshot thumbnail"
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  )}
                                  <button
                                    onClick={() => setExpandedFeedbackId(isExpanded ? null : item.id)}
                                    className="text-[var(--text-secondary)] hover:text-white bg-transparent border-none cursor-pointer p-0"
                                  >
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </button>
                                </div>
                              </div>

                              {/* Expandable Explanation Area */}
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="text-xs text-[var(--text-secondary)] font-sans py-2 border-t border-[#2a2a2a] mt-1 leading-relaxed whitespace-pre-wrap flex flex-col gap-2.5">
                                      <span>{item.description}</span>
                                      {item.screenshot && (
                                        <div className="mt-1 flex">
                                          <div
                                            onClick={() => setActiveScreenshotViewer(`data:image/jpeg;base64,${item.screenshot}`)}
                                            className="relative w-20 h-20 border-2 border-black rounded overflow-hidden shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 cursor-pointer transition-all shrink-0"
                                          >
                                            <img
                                              src={`data:image/jpeg;base64,${item.screenshot}`}
                                              alt="Screenshot preview"
                                              className="w-full h-full object-cover"
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 pt-2 border-t border-[#222]">
                                      <span>By {item.userName}</span>
                                      <span>{new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                    </div>

                                    {/* Admin Controls Section */}
                                    {profile?.isAdmin === true && (
                                      <div className="bg-[#222] border-2 border-black rounded p-2 mt-3 flex flex-col gap-1.5 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                                        <span className="text-[8px] font-mono text-[var(--secondary)] uppercase tracking-wider font-extrabold">
                                          Admin Control Center
                                        </span>
                                        <div className="flex items-center justify-between gap-2 mt-1">
                                          {/* Status Selector */}
                                          <div className="flex gap-1">
                                            {['Future Plans', 'In Progress', 'Done'].map((st) => (
                                              <button
                                                key={st}
                                                onClick={() => handleUpdateStatus(item.id, st)}
                                                className={`px-1.5 py-1 rounded text-[8px] font-sans font-bold border cursor-pointer ${
                                                  item.status === st
                                                    ? 'bg-[var(--secondary)] text-black border-black'
                                                    : 'bg-[#1a1a1a] text-white border-[#333] hover:border-[#555]'
                                                }`}
                                              >
                                                {st === 'Future Plans' ? 'Future' : st === 'In Progress' ? 'Progress' : 'Done'}
                                              </button>
                                            ))}
                                          </div>
                                          {/* Delete Trash Button */}
                                          <button
                                            onClick={() => handleDeleteFeedback(item.id)}
                                            className="p-1 text-red-500 hover:text-red-400 bg-transparent border-none cursor-pointer"
                                            title="Delete suggestion permanently"
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {/* Vote and Action Row */}
                              <div className="flex items-center justify-between border-t border-[#222] pt-2 mt-1 shrink-0">
                                <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                                  Score:{' '}
                                  <strong className={netScore > 0 ? 'text-green-500' : netScore < 0 ? 'text-red-500' : 'text-white'}>
                                    {netScore > 0 ? `+${netScore}` : netScore}
                                  </strong>
                                </span>

                                <div className="flex items-center gap-1.5">
                                  {/* Upvote */}
                                  <button
                                    onClick={() => handleVote(item.id, 'up')}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded border-2 font-mono text-[10px] font-extrabold transition-all cursor-pointer ${
                                      hasUpvoted
                                        ? 'bg-emerald-950 text-emerald-400 border-emerald-500 shadow-[2px_2px_0px_rgba(0,0,0,1)]'
                                        : 'bg-[#1e1e1e] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
                                    }`}
                                  >
                                    <ThumbsUp size={11} />
                                    <span>{upvotes.length}</span>
                                  </button>

                                  {/* Downvote */}
                                  <button
                                    onClick={() => handleVote(item.id, 'down')}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded border-2 font-mono text-[10px] font-extrabold transition-all cursor-pointer ${
                                      hasDownvoted
                                        ? 'bg-rose-950 text-rose-400 border-rose-500 shadow-[2px_2px_0px_rgba(0,0,0,1)]'
                                        : 'bg-[#1e1e1e] text-[var(--text-secondary)] border-[#2c2c2c] hover:border-[#444]'
                                    }`}
                                  >
                                    <ThumbsDown size={11} />
                                    <span>{downvotes.length}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </>
  );
};
