import React from 'react';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const PricingModal: React.FC<PricingModalProps> = ({ isOpen, onClose, userId }) => {
  if (!isOpen) return null;

  // TODO: Replace these placeholder URLs with actual Payment Links from your Stripe Dashboard
  // Go to Stripe Dashboard > Products > Payment Links and copy the URLs here
  const STRIPE_LINKS = {
    advanced: "https://buy.stripe.com/test_bJe8wQdTD3TZ1nsaDGaEE00", // Put your Advanced link here
    pro: "https://buy.stripe.com/test_4gMfZi5n7duz8PUh24aEE01"      // Put your Pro link here
  };

// Helper to append ID safely
const getLink = (url: string) => `${url}?client_reference_id=${userId}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 serif">Choose Your Mentor Level</h2>
          <p className="text-slate-600 dark:text-slate-400">Unlock deeper insights, vision capabilities, and real-time guidance.</p>
        </div>

        {/* Pricing Cards */}
        <div className="p-8 overflow-y-auto grid md:grid-cols-3 gap-6">
          
          {/* FREE TIER */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 flex flex-col hover:border-indigo-500 transition-colors">
            <div className="mb-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Basic</h3>
              <p className="text-sm text-slate-500">For Students</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold text-slate-900 dark:text-white">$0</span>
              <span className="text-slate-500">/mo</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              <FeatureItem text="Standard Chat Model" />
              <FeatureItem text="50 Messages / Day" />
              <FeatureItem text="Basic Code Explanations" />
              <FeatureItem text="No Vision Capabilities" dim />
              <FeatureItem text="No Live Interaction" dim />
            </ul>
            <button className="w-full py-3 px-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold cursor-not-allowed opacity-50">
              Current Plan
            </button>
          </div>

          {/* ADVANCED TIER */}
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/10 p-6 flex flex-col relative transform hover:-translate-y-1 transition-transform duration-300">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
              Most Popular
            </div>
            <div className="mb-4">
              <h3 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Advanced</h3>
              <p className="text-sm text-slate-500">For Engineers</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold text-slate-900 dark:text-white">$20</span>
              <span className="text-slate-500">/mo</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              <FeatureItem text="Advanced Chat Model (Pro)" active />
              <FeatureItem text="Unlimited Messages" active />
              <FeatureItem text="Vision (Screenshot Analysis)" active />
              <FeatureItem text="Project Context Memory" active />
              <FeatureItem text="No Live Interaction" dim />
            </ul>
            <a 
              href={getLink(STRIPE_LINKS.advanced)}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 px-4 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20"
            >
              Upgrade to Advanced
            </a>
          </div>

          {/* PRO TIER */}
          <div className="rounded-xl border border-purple-200 dark:border-purple-900 bg-gradient-to-b from-purple-50/10 to-transparent p-6 flex flex-col transform hover:-translate-y-1 transition-transform duration-300">
            <div className="mb-4">
              <h3 className="text-xl font-bold text-purple-600 dark:text-purple-400">Pro</h3>
              <p className="text-sm text-slate-500">For Masters</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold text-slate-900 dark:text-white">$50</span>
              <span className="text-slate-500">/mo</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              <FeatureItem text="Best-in-Class Model (Ultra)" active />
              <FeatureItem text="Unlimited Everything" active />
              <FeatureItem text="Deep Codebase Indexing" active />
              <FeatureItem text="Live Interaction Mode" active highlight />
              <FeatureItem text="Real-time Voice & Vision" active highlight />
            </ul>
            <a 
              href={STRIPE_LINKS.pro}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 px-4 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold hover:opacity-90 transition-opacity shadow-lg"
            >
              Get Drona Pro
            </a>
          </div>

        </div>
        
        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 text-center text-xs text-slate-400 border-t border-slate-200 dark:border-slate-800">
          Secure payments processed by Stripe. Cancel anytime.
        </div>
      </div>
    </div>
  );
};

const FeatureItem = ({ text, active = false, dim = false, highlight = false }: { text: string, active?: boolean, dim?: boolean, highlight?: boolean }) => (
  <li className={`flex items-start gap-3 ${dim ? 'opacity-40' : ''}`}>
    <div className={`mt-1 p-0.5 rounded-full ${highlight ? 'bg-purple-100 text-purple-600' : active ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
    </div>
    <span className={`text-sm ${highlight ? 'font-bold text-purple-700 dark:text-purple-300' : 'text-slate-700 dark:text-slate-300'}`}>{text}</span>
  </li>
);

export default PricingModal;