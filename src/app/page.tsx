"use client";

import { useState } from "react";
import { MessageSquare, Video, User, Dumbbell, LogOut } from "lucide-react";
import { ChatTab } from "@/components/chat-tab";
import { VideoReviewTab } from "@/components/video-review-tab";
import { StyleFinderTab } from "@/components/style-finder-tab";
import { AuthGate } from "@/components/auth-gate";
import { signOut } from "@/lib/auth";

const tabs = [
  { id: "technique", label: "Technique", icon: MessageSquare, description: "Ask about punching mechanics" },
  { id: "drills", label: "Drills", icon: Dumbbell, description: "Exercises & training" },
  { id: "video", label: "Video Review", icon: Video, description: "Analyze your footage" },
  { id: "style", label: "Find Your Style", icon: User, description: "Discover your fighting style" },
] as const;

type TabId = (typeof tabs)[number]["id"];

interface AppContentProps {
  userId: string;
  userEmail: string;
}

function AppContent({ userEmail }: AppContentProps) {
  const [activeTab, setActiveTab] = useState<TabId>("technique");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-bold text-white text-sm">
            PD
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Punch Doctor AI</h1>
            <p className="text-xs text-muted">Powered by Alex Wiant DC&apos;s methodology</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted hover:text-foreground transition-colors"
          title={userEmail}
        >
          <LogOut size={14} />
          Sign out
        </button>
      </header>

      {/* Tab Navigation */}
      <nav className="flex border-b border-border px-4 sm:px-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === "technique" && (
          <ChatTab
            systemContext="technique"
            placeholder="Ask about punch mechanics, kinetic chains, phases..."
            suggestions={[
              "How does Canelo use kinetic chains in his jab?",
              "Break down Beterbiev's power — what makes him hit so hard?",
              "What's the difference between a push punch and a throw?",
              "How should I use hip rotation for a left hook?",
            ]}
          />
        )}
        {activeTab === "drills" && (
          <ChatTab
            systemContext="drills"
            placeholder="Ask about exercises, training routines, bag work..."
            suggestions={[
              "What exercises build punching power using kinetic chains?",
              "Give me a rotator cuff warm-up routine for boxing",
              "How do I practice the 4 phases of torque?",
              "What's the right way to throw a medicine ball for punching power?",
            ]}
          />
        )}
        {activeTab === "video" && <VideoReviewTab />}
        {activeTab === "style" && <StyleFinderTab />}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <AuthGate>
      {(user) => <AppContent userId={user.id} userEmail={user.email ?? ""} />}
    </AuthGate>
  );
}
