"use client";

import { useEffect, useState } from "react";
import {
  MessageSquare,
  ClipboardList,
  User,
  Dumbbell,
  Zap,
  Flame,
  GitBranch,
  RotateCw,
  Shield,
  Target,
  Timer,
} from "lucide-react";
import { ChatTab } from "@/components/chat-tab";
import { CoachTab } from "@/components/coach-tab";
import { StyleFinderTab } from "@/components/style-finder-tab";

const tabs = [
  { id: "technique", label: "Technique", shortLabel: "Technique", icon: MessageSquare, description: "Ask about punching mechanics" },
  { id: "drills", label: "Drills", shortLabel: "Drills", icon: Dumbbell, description: "Exercises & training" },
  { id: "coach", label: "My Coach", shortLabel: "Coach", icon: ClipboardList, description: "Log sessions & track progress" },
  { id: "style", label: "Find Your Style", shortLabel: "Style", icon: User, description: "Discover your fighting style" },
] as const;

type TabId = (typeof tabs)[number]["id"];

function getAnonymousUserId(): string {
  if (typeof window === "undefined") return "anon";
  let id = localStorage.getItem("punch-doctor-user-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("punch-doctor-user-id", id);
  }
  return id;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabId>("technique");
  const [coachQuery, setCoachQuery] = useState<string | undefined>();
  const userId = getAnonymousUserId();

  useEffect(() => {
    // Once the technique tab mounts ChatTab with the pending query, clear it
    // so navigating away and back does not re-fire the request.
    if (activeTab === "technique" && coachQuery) {
      const id = setTimeout(() => setCoachQuery(undefined), 0);
      return () => clearTimeout(id);
    }
  }, [activeTab, coachQuery]);

  return (
    <div className="flex h-full flex-col">
      {/* Header + Tab Navigation */}
      <header className="border-b border-border">
        <div className="flex items-center gap-3 px-4 sm:px-6 pt-4 pb-3">
          <span className="text-xl" role="img" aria-label="Boxing glove">🥊</span>
          <h1 className="text-lg font-semibold leading-tight">Boxing Coach AI</h1>
        </div>
        <nav className="flex px-4 sm:px-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-3 min-h-[44px] text-xs sm:text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <Icon size={16} />
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
        </nav>
      </header>

      {/* Tab Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === "technique" && (
          <ChatTab
            systemContext="technique"
            heroIcon={MessageSquare}
            heroTitle="What technique are you curious about?"
            heroSubtitle="Ask about punch mechanics, kinetic chains, or break down how a pro generates power."
            placeholder="Ask about punch mechanics, kinetic chains, phases..."
            suggestions={[
              { text: "How does Canelo use kinetic chains in his jab?", Icon: Zap },
              { text: "Break down Beterbiev's power — what makes him hit so hard?", Icon: Flame },
              { text: "What's the difference between a push punch and a throw?", Icon: GitBranch },
              { text: "How should I use hip rotation for a left hook?", Icon: RotateCw },
            ]}
            initialQuery={coachQuery}
            userId={userId}
          />
        )}
        {activeTab === "drills" && (
          <ChatTab
            systemContext="drills"
            heroIcon={Dumbbell}
            heroTitle="Looking for a drill?"
            heroSubtitle="Exercises, warm-ups, and bag work pulled straight from the Power Punching Blueprint."
            placeholder="Ask about exercises, training routines, bag work..."
            suggestions={[
              { text: "What exercises build punching power using kinetic chains?", Icon: Zap },
              { text: "Give me a rotator cuff warm-up routine for boxing", Icon: Shield },
              { text: "How do I practice the 4 phases of torque?", Icon: Timer },
              { text: "What's the right way to throw a medicine ball for punching power?", Icon: Target },
            ]}
            userId={userId}
          />
        )}
        {activeTab === "coach" && <CoachTab userId={userId} />}
        {activeTab === "style" && (
          <StyleFinderTab
            userId={userId}
            onSwitchToChat={(query) => {
              setCoachQuery(query);
              setActiveTab("technique");
            }}
          />
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return <AppContent />;
}
