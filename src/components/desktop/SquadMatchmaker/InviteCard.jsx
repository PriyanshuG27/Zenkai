import React from 'react';

export const InviteCard = ({ invite, profile, handleAcceptInvite, handleDeclineInvite, handleDeclineAndMuteInvite }) => {
  return (
    <div key={invite.inviteId} className="border border-yellow-500/30 bg-black/40 p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs font-mono text-white">
      <div className="flex flex-col text-left">
        <span><strong>{invite.inviterName}</strong> invited you to join <strong>{invite.squadName}</strong></span>
        <span className="text-[9px] text-neutral-500 uppercase mt-0.5">Code: {invite.squadCode}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => handleAcceptInvite(invite)}
          disabled={!profile?.gymId}
          title={!profile?.gymId ? 'Configure your Home Gym first' : ''}
          className="bg-green-500 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-black font-display font-black text-[10px] px-3 py-1.5 border border-black rounded shadow-[1.5px_1.5px_0px_black] uppercase cursor-pointer transition-all"
        >
          Accept
        </button>
        <button
          onClick={() => handleDeclineInvite(invite)}
          className="bg-red-500 hover:bg-red-600 text-black font-display font-black text-[10px] px-3 py-1.5 border border-black rounded shadow-[1.5px_1.5px_0px_black] uppercase cursor-pointer transition-all"
        >
          Decline
        </button>
        <button
          onClick={() => handleDeclineAndMuteInvite(invite)}
          className="bg-neutral-800 hover:bg-neutral-700 text-white font-display font-black text-[10px] px-3 py-1.5 border border-black rounded shadow-[1.5px_1.5px_0px_black] uppercase cursor-pointer transition-all"
          title="Decline invite and opt out from Free Agent registry"
        >
          Decline & Turn Off Invites
        </button>
      </div>
    </div>
  );
};
