import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Clock, Database, Eye, Trash2, ShieldAlert } from 'lucide-react';

export const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#080808] text-[#F0F0F0] font-sans selection:bg-[#FF5C00]/30 selection:text-[#FF5C00] py-12 px-4 sm:px-6 lg:px-8">
      {/* Background Radial Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-[400px] rounded-full bg-radial-gradient from-[#00D4FF]/5 via-transparent to-transparent blur-[100px] pointer-events-none z-0" />

      <div className="max-w-3xl mx-auto relative z-10">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between mb-8 border-b-2 border-[#222222] pb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-black bg-[#111111] hover:bg-[#1A1A1A] text-xs font-mono font-bold uppercase transition shadow-[3px_3px_0px_black] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
          <div className="text-right">
            <h1 className="font-display text-2xl font-black uppercase tracking-tight text-white leading-none">
              Privacy Policy
            </h1>
            <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest mt-1 block">
              Zenkai Data Protection
            </span>
          </div>
        </div>

        {/* Introduction Card */}
        <div className="border-2 border-black bg-[#111111] p-6 rounded-2xl shadow-[5px_5px_0px_black] mb-6 flex items-start gap-4">
          <div className="p-3 rounded-xl bg-[#00d4ff0e] border border-[#00D4FF] text-[#00D4FF] shrink-0">
            <Shield size={24} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white uppercase tracking-wide">Our Privacy Standard</h2>
            <p className="text-xs text-neutral-400 leading-relaxed mt-2">
              At Zenkai, we build athletic tracking systems, not advertising platforms. We do not sell your personal information, display third-party advertisements, or track your behavior across other apps. We process your data in compliance with the Indian Digital Personal Data Protection (DPDP) Act 2023 and other applicable regulations.
            </p>
            <p className="text-[10px] font-mono text-neutral-500 mt-3 flex items-center gap-1">
              <Clock size={12} />
              <span>Last updated: June 30, 2026</span>
            </p>
          </div>
        </div>

        {/* Main Content Sections */}
        <div className="flex flex-col gap-6">
          {/* Section 1: Data We Collect */}
          <div className="border-2 border-black bg-[#111111] p-6 rounded-2xl shadow-[5px_5px_0px_black]">
            <div className="flex items-center gap-2 border-b border-[#222222] pb-3 mb-4">
              <Database size={18} className="text-[#FF5C00]" />
              <h3 className="font-display font-black text-sm text-white uppercase tracking-wider">
                1. Information We Collect
              </h3>
            </div>
            
            <div className="space-y-4 text-xs text-neutral-300 leading-relaxed">
              <p>
                To provide you with custom AI training schedules and gamified progression levels, we store the following data:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white">Account Profile:</strong> Your name, email address, profile photo, and credentials. This is collected when you sign up directly or authenticate via Google.
                </li>
                <li>
                  <strong className="text-white">Training Metrics:</strong> Workout history (logged exercises, sets, weights, and repetitions), personal records (PRs), workout frequencies, streaks, and squad interactions.
                </li>
                <li>
                  <strong className="text-white">Medical and Injury Flags (Sensitive Health-Adjacent Data):</strong> You may optionally configure medical or injury flags (such as "Shoulder Impingement" or "Lower Back Issues"). This data is strictly used locally and on your secure database document to filter out unsafe exercises from AI workout recommendations. It is stored on your device and Firestore private profile. It is never shared with other players, squad members, or public leaderboards, and Firestore security rules explicitly restrict access to the authenticated owner of the profile.
                </li>
                <li>
                  <strong className="text-white">Gym Verification Photos:</strong> When utilizing the Overdrive Hour feature, you may optionally capture and upload a photo of gym equipment. 
                  <div className="border border-dashed border-[#00D4FF]/20 bg-[#00d4ff07] p-2.5 rounded-lg mt-1.5 text-[11px] text-[#00D4FF] leading-normal font-sans">
                    <strong>Image Privacy Guarantee and Gemini API terms:</strong> These photos are processed securely using Google's Gemini API to verify the presence of training equipment. 
                    Because the Gemini API under the free tier may log prompt inputs for Google product improvements, we advise users to never capture faces or personally identifiable visual information in verification photos.
                    On our end, the verified result is saved, and we do not store the source images on Zenkai servers.
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* Section 2: How We Use Data & Social Visibility */}
          <div className="border-2 border-black bg-[#111111] p-6 rounded-2xl shadow-[5px_5px_0px_black]">
            <div className="flex items-center gap-2 border-b border-[#222222] pb-3 mb-4">
              <Eye size={18} className="text-[#00D4FF]" />
              <h3 className="font-display font-black text-sm text-white uppercase tracking-wider">
                2. Processing & Public Visibility
              </h3>
            </div>
            
            <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
              <p>
                Zenkai splits user data into public/social records and private records:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong className="text-white">Publicly Visible (Squad & Leaderboards):</strong> Your Trainer Name, Avatar (including rented glowing auras/titles), Current Level, streak count, and workout completion events (such as logging a session or setting a PR). This is visible to other squad members and leaderboard participants.
                </li>
                <li>
                  <strong className="text-white">Strictly Private:</strong> Your email address, password, custom weekly AI plan schedule details, and medical/injury flags.
                </li>
              </ul>
            </div>
          </div>

          {/* Section 3: Third Party Services & Cross-Border Transfer */}
          <div className="border-2 border-black bg-[#111111] p-6 rounded-2xl shadow-[5px_5px_0px_black]">
            <div className="flex items-center gap-2 border-b border-[#222222] pb-3 mb-4">
              <Shield size={18} className="text-[#B5FF2D]" />
              <h3 className="font-display font-black text-sm text-white uppercase tracking-wider">
                3. Sub-Processors & Cross-Border Data Transfer
              </h3>
            </div>
            
            <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
              <p>
                Because Firebase databases and Google Gemini API servers are hosted in the United States, your personal data is transferred and stored outside of India. By creating an account and consenting to this Privacy Policy, you explicitly agree to this cross-border transfer. We use the following sub-processors:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white">Firebase (Google Cloud):</strong> Handles secure email/password database hosting, live Firestore synchronization, and asset hosting.
                </li>
                <li>
                  <strong className="text-white">Google Gemini API:</strong> Processes your gym presence verification photos and structures your custom weekly AI training plans.
                </li>
                <li>
                  <strong className="text-white">Vercel Analytics & Speed Insights:</strong> Privacy-focused client performance tracking. We do not run cross-app tracking, cookie-based profiling, or Firebase Analytics tracking.
                </li>
              </ul>
            </div>
          </div>

          {/* Section 4: Minor Protection (13-17) */}
          <div className="border-2 border-black bg-[#111111] p-6 rounded-2xl shadow-[5px_5px_0px_black]">
            <div className="flex items-center gap-2 border-b border-[#222222] pb-3 mb-4">
              <ShieldAlert size={18} className="text-[#FF5C00]" />
              <h3 className="font-display font-black text-sm text-white uppercase tracking-wider">
                4. Minor Protection Policy (13–17)
              </h3>
            </div>
            
            <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
              <p>
                Zenkai treats data from minor users aged 13 to 17 with strict privacy controls in compliance with global minor protection guidelines:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>We do not run any behavioral analytics, targeting, profiling, or custom promotions on users in this age bracket.</li>
                <li>All medical, physical weight, and training logs are strictly functional to generate safe lifting recommendations.</li>
              </ul>
            </div>
          </div>

          {/* Section 5: Cookies and Local Storage */}
          <div className="border-2 border-black bg-[#111111] p-6 rounded-2xl shadow-[5px_5px_0px_black]">
            <div className="flex items-center gap-2 border-b border-[#222222] pb-3 mb-4">
              <Database size={18} className="text-[#00D4FF]" />
              <h3 className="font-display font-black text-sm text-white uppercase tracking-wider">
                5. Cookies & Local Storage
              </h3>
            </div>
            
            <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
              <p>
                Zenkai does not use tracking cookies for advertising. We use device local storage (`localStorage`) strictly to store session authentication tokens (provided by Firebase Auth), local SWR cache configurations, and user interface preferences. This data remains on your local device.
              </p>
            </div>
          </div>

          {/* Section 6: Security, Retention & Business Transfer */}
          <div className="border-2 border-black bg-[#111111] p-6 rounded-2xl shadow-[5px_5px_0px_black]">
            <div className="flex items-center gap-2 border-b border-[#222222] pb-3 mb-4">
              <Clock size={18} className="text-[#B5FF2D]" />
              <h3 className="font-display font-black text-sm text-white uppercase tracking-wider">
                6. Security, Retention & Business Transfer
              </h3>
            </div>
            
            <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
              <p>
                <strong className="text-white">Security Controls:</strong> All data in transit is protected using industry-standard HTTPS/TLS protocols. Data at rest is encrypted using Firebase's underlying Google Cloud infrastructure (AES-256 encryption).
              </p>
              <p>
                <strong className="text-white">Data Retention:</strong> Workout logs, streaks, and profile details are retained for active accounts. If an account remains completely inactive for more than 24 consecutive months, we reserve the right to delete all historical logs and profile data. Temporary upload files (such as gym verification photos) are deleted immediately upon verification completion.
              </p>
              <p>
                <strong className="text-white">Business Transfer:</strong> In the event that Zenkai undergoes a business transition, such as a merger, acquisition, or sale of assets, your training and profile data may be transferred as part of the transaction. We will notify you via email or in-app notice prior to any transfer where your data becomes subject to a different privacy policy.
              </p>
              <p>
                <strong className="text-white">Breach Notification:</strong> In the event of a confirmed data breach involving personal information, we will notify affected users via email and post an in-app notice within 72 hours of verification of the breach, in accordance with the Indian DPDP Act 2023.
              </p>
            </div>
          </div>

          {/* Section 7: Deletion & User Rights */}
          <div className="border-2 border-black bg-[#111111] p-6 rounded-2xl shadow-[5px_5px_0px_black]">
            <div className="flex items-center gap-2 border-b border-[#222222] pb-3 mb-4">
              <Trash2 size={18} className="text-red-500" />
              <h3 className="font-display font-black text-sm text-white uppercase tracking-wider">
                7. Formally Enumerated User Rights
              </h3>
            </div>
            
            <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
              <p>
                Under the Indian DPDP Act 2023, you have the following rights over your personal data:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong className="text-white">Right to Access & Portability:</strong> You can request a digital copy of all your historical training metrics and profile configurations.
                </li>
                <li>
                  <strong className="text-white">Right to Correction:</strong> You can edit your profile details, available equipment lists, and medical tags directly in your settings.
                </li>
                <li>
                  <strong className="text-white">Right to Erasure (Withdrawal of Consent):</strong> You can completely wipe your logs, streak progress, XP records, and authentication files. To execute this, visit your profile screen, navigate to the <span className="text-red-500 font-semibold font-mono">DANGER ZONE</span>, and select <span className="text-red-500 font-semibold uppercase">Wipe My Data</span>.
                </li>
              </ul>
              
              <div className="border border-[#222222] bg-[#141414] p-3 rounded-lg mt-4 text-[11px] leading-relaxed">
                <strong className="text-white">Grievance Redressal / Contact:</strong><br />
                If you have complaints, questions about these rights, or wish to submit a grievance, contact our Data Protection Officer:<br />
                <span className="font-semibold text-white">Priyanshu Gumber</span><br />
                Email: <a href="mailto:help.zenkai@outlook.com" className="text-[#00D4FF] hover:underline font-mono">help.zenkai@outlook.com</a>
              </div>
            </div>
          </div>

          {/* Section 8: Changes to Policy */}
          <div className="border-2 border-black bg-[#111111] p-6 rounded-2xl shadow-[5px_5px_0px_black]">
            <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
              <strong className="text-white uppercase tracking-wider text-[10px] block">8. Policy Changes</strong>
              <p>
                We may update this Privacy Policy from time to time. If we make material changes, we will update the "Last updated" date above and post a notification inside the app settings dashboard. Continued use of Zenkai after changes constitutes acceptance of the new terms.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-[10px] font-mono text-neutral-600 uppercase tracking-widest border-t border-[#222222] pt-6">
          Zenkai Strength Engineering • DPDP Compliant
        </div>
      </div>
    </div>
  );
};
