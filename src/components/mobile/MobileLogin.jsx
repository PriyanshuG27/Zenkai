import React from 'react';

export const MobileLogin = () => {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-4 flex flex-col justify-center items-center">
      <h2 className="text-heading text-2xl text-text-primary mb-4">Login to FitDesi</h2>
      <div className="w-full max-w-sm space-y-4">
        <input 
          type="email" 
          placeholder="Email" 
          className="w-full bg-bg-input border border-border-bright rounded p-3 text-text-primary focus:outline-none focus:border-primary"
        />
        <input 
          type="password" 
          placeholder="Password" 
          className="w-full bg-bg-input border border-border-bright rounded p-3 text-text-primary focus:outline-none focus:border-primary"
        />
        <button className="w-full bg-primary hover:brightness-110 text-white font-semibold py-3 rounded-lg transition">
          Login
        </button>
      </div>
    </div>
  );
};
