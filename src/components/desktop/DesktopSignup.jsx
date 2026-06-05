import React from 'react';

export const DesktopSignup = () => {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-8 flex flex-col justify-center items-center">
      <div className="w-full max-w-md bg-bg-surface p-8 rounded-xl border border-border space-y-6">
        <h2 className="text-heading text-3xl text-text-primary text-center">Create Account</h2>
        <div className="space-y-4">
          <input 
            type="text" 
            placeholder="Full Name" 
            className="w-full bg-bg-input border border-border-bright rounded p-3 text-text-primary focus:outline-none focus:border-primary"
          />
          <input 
            type="email" 
            placeholder="Email Address" 
            className="w-full bg-bg-input border border-border-bright rounded p-3 text-text-primary focus:outline-none focus:border-primary"
          />
          <input 
            type="password" 
            placeholder="Password (minimum 8 characters)" 
            className="w-full bg-bg-input border border-border-bright rounded p-3 text-text-primary focus:outline-none focus:border-primary"
          />
          <button className="w-full bg-primary hover:brightness-110 text-white font-semibold py-3 rounded-lg transition">
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
};
