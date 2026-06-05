import React from 'react';

export const MobileLanding = () => {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-4 flex flex-col justify-center items-center">
      <h1 className="text-display text-4xl text-primary mb-2">FitDesi</h1>
      <p className="text-body text-text-secondary text-center mb-6">
        AI-powered workout logging and comeback plans for Indian athletes. (Mobile view)
      </p>
      <button className="bg-primary hover:brightness-110 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition duration-150">
        Get Started
      </button>
    </div>
  );
};
