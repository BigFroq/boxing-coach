"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { ErrorBoundary } from "@/components/error-boundary";
import { track, identify } from "@/lib/analytics";
import { initialsFrom } from "@/lib/profile-initials";
import { DrillProgramView } from "@/components/drills/program-view";

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
    // Pre-seed from `?q=…` (from /pd) and/or `?tab=…` (from /me deep-links).
    // Both are consumed synchronously and stripped from the URL.
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const seed = params.get("q");
    const tab = params.get("tab");
    let changed = false;
    if (seed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCoachQuery(seed);
      params.delete("q");
      changed = true;
    }
    if (tab && (tabs as readonly { id: string }[]).some((t) => t.id === tab)) {
      setActiveTab(tab as TabId);
      params.delete("tab");
      changed = true;
    }
    if (changed) {
      const newUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState(null, "", newUrl);
    }
  }, []);

  useEffect(() => {
    // Identify the anon user in PostHog so we can track cohorts across sessions.
    if (userId && userId !== "anon") identify(userId);
  }, [userId]);

  useEffect(() => {
    // Once the technique tab mounts ChatTab with the pending query, clear it
    // so navigating away and back does not re-fire the request.
    if (activeTab === "technique" && coachQuery) {
      const id = setTimeout(() => setCoachQuery(undefined), 0);
      return () => clearTimeout(id);
    }
  }, [activeTab, coachQuery]);

  const handleTabClick = (id: TabId) => {
    if (id !== activeTab) track("tab_switch", { from: activeTab, to: id });
    setActiveTab(id);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header + Tab Navigation */}
      <header className="border-b border-border">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-xl" role="img" aria-label="Boxing glove">🥊</span>
            <h1 className="text-lg font-semibold leading-tight">Boxing Coach AI</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/about"
              className="text-xs text-muted hover:text-foreground underline-offset-2 hover:underline"
            >
              About & limitations
            </Link>
            <ProfileAvatarLink />
          </div>
        </div>
        <nav className="flex px-4 sm:px-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-3 min-h-[44px] text-xs sm:text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="sm:hidden" aria-hidden="true">{tab.shortLabel}</span>
              <span className="hidden sm:inline" aria-hidden="true">{tab.label}</span>
            </button>
          );
        })}
        </nav>
      </header>

      {/* Tab Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === "technique" && (
          <ErrorBoundary label="Technique chat">
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
          </ErrorBoundary>
        )}
        {activeTab === "drills" && (
          <div className="flex flex-col h-full overflow-y-auto">
            <ErrorBoundary label="Drill program">
              <DrillProgramView
                userId={userId}
                onSwitchTab={(tabId) => setActiveTab(tabId as TabId)}
              />
            </ErrorBoundary>
            <div className="border-t border-border my-4" />
            <ErrorBoundary label="Drills chat">
              <div className="min-h-[70vh] flex flex-col">
                <ChatTab
                  systemContext="drills"
                  heroIcon={Dumbbell}
                  heroTitle="Or ask about a specific drill"
                  heroSubtitle="Free-form questions about exercises, warm-ups, and bag work."
                  placeholder="Ask about exercises, training routines, bag work..."
                  suggestions={[
                    { text: "What exercises build punching power using kinetic chains?", Icon: Zap },
                    { text: "Give me a rotator cuff warm-up routine for boxing", Icon: Shield },
                    { text: "How do I practice the 4 phases of torque?", Icon: Timer },
                    { text: "What's the right way to throw a medicine ball for punching power?", Icon: Target },
                  ]}
                  userId={userId}
                />
              </div>
            </ErrorBoundary>
          </div>
        )}
        {activeTab === "coach" && (
          <ErrorBoundary label="My Coach">
            <CoachTab userId={userId} />
          </ErrorBoundary>
        )}
        {activeTab === "style" && (
          <ErrorBoundary label="Find Your Style">
            <StyleFinderTab
              userId={userId}
              onSwitchToChat={(query) => {
                setCoachQuery(query);
                setActiveTab("technique");
              }}
            />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}

function ProfileAvatarLink() {
  const [initials, setInitials] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const name = window.localStorage.getItem("punch-doctor-display-name");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitials(initialsFrom(name));
  }, []);

  return (
    <Link
      href="/me"
      aria-label="Your profile"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20"
    >
      {initials || <User size={14} aria-hidden />}
    </Link>
  );
}

export default function Home() {
  return <AppContent />;
}
