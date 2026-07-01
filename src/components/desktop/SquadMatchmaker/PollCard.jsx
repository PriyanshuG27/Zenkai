import React from 'react';

export const PollCard = ({ poll, uid, handleVote }) => {
  const totalVotes = Object.keys(poll.votes || {}).length;

  return (
    <div key={poll.id} className="border border-neutral-850 bg-neutral-950/40 p-4 rounded-xl shadow-md flex flex-col gap-3 font-mono text-xs text-left">
      <div className="flex justify-between items-start gap-2 border-b border-neutral-800/40 pb-2">
        <div className="flex flex-col">
          <span className="text-xs text-[var(--primary)] font-bold">{poll.question}</span>
          <span className="text-[8px] text-neutral-500 uppercase mt-0.5 font-bold">Started by {poll.creatorName} • {totalVotes} votes</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {poll.options.map((opt, optIdx) => {
          const votesForOption = Object.values(poll.votes || {}).filter(v => v === optIdx).length;
          const pct = totalVotes > 0 ? Math.round((votesForOption / totalVotes) * 100) : 0;
          const hasVoted = poll.votes?.[uid] === optIdx;

          return (
            <button
              key={optIdx}
              onClick={() => handleVote(poll.id, optIdx)}
              className={`relative w-full border border-neutral-800 hover:border-[var(--primary)] text-left px-4 py-3 rounded-xl font-mono text-xs text-white uppercase cursor-pointer transition-all overflow-hidden flex justify-between items-center ${
                hasVoted ? 'bg-black border-[var(--primary)] shadow-[0_0_10px_rgba(255,92,0,0.1)]' : 'bg-neutral-950/40 hover:bg-neutral-900/30'
              }`}
            >
              <div 
                className={`absolute top-0 left-0 bottom-0 ${hasVoted ? 'bg-[var(--primary)]/15' : 'bg-neutral-800/35'} transition-all`}
                style={{ width: `${pct}%`, zIndex: 0 }}
              />
              <span className="z-10 font-bold flex items-center gap-1.5">
                {hasVoted && <span className="text-[var(--primary)] text-sm">●</span>}
                <span>{opt}</span>
              </span>
              <span className="z-10 text-[10px] text-neutral-400 font-black shrink-0">{votesForOption} votes ({pct}%)</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
