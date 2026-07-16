"use client";

import { useCallback, useEffect, useState } from "react";
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
  Gamepad2,
  Sun,
  Moon,
} from "lucide-react";
import { ChatTab } from "@/components/chat-tab";
import { CoachTab } from "@/components/coach-tab";
import { StyleFinderTab } from "@/components/style-finder-tab";
import { GamesHub } from "@/components/games/hub";
import { ErrorBoundary } from "@/components/error-boundary";
import { track, identify } from "@/lib/analytics";
import { ensureUserEngagement } from "@/lib/user-engagement-sync";
import { initialsFrom } from "@/lib/profile-initials";
import { DrillProgramView } from "@/components/drills/program-view";
import { fetchRecentClips } from "@/lib/clip-log-storage";
import { aggregateClipHistory } from "@/lib/clip-log-aggregation";

const tabs = [
  { id: "technique", label: "Technique", shortLabel: "Tech", icon: MessageSquare, description: "Ask about punching mechanics" },
  { id: "drills", label: "Drills", shortLabel: "Drills", icon: Dumbbell, description: "Exercises & training" },
  { id: "coach", label: "My Coach", shortLabel: "Coach", icon: ClipboardList, description: "Log sessions & track progress" },
  { id: "style", label: "Find Your Style", shortLabel: "Style", icon: User, description: "Discover your fighting style" },
  { id: "games", label: "Games", shortLabel: "Games", icon: Gamepad2, description: "Reflex challenges & fun" },
] as const;

type TabId = (typeof tabs)[number]["id"];

type RoomMastheadProps = {
  index: string;
  kicker: string;
  title: string;
  description: string;
};

function RoomMasthead({ index, kicker, title, description }: RoomMastheadProps) {
  return (
    <div className="room-masthead shrink-0 px-5 py-3 sm:px-8 sm:py-4" data-round={index}>
      <div className="relative z-10 max-w-3xl">
        <p className="room-kicker">{index} / {kicker}</p>
        <h2 className="room-title mt-1.5 max-w-2xl">{title}</h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/55 sm:text-base">{description}</p>
      </div>
    </div>
  );
}

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
    // Track per-user return cadence — feeds the streak chip and D1/D7/D30
    // cohort metrics. Single-flight inside the helper handles StrictMode
    // double-mount.
    if (userId && userId !== "anon") {
      void ensureUserEngagement(userId);
    }
  }, [userId]);

  // Per-submit provider for ChatTab. Re-fetches at each chat submit so the
  // coach sees clips logged mid-session. Known race: if saveClipLog is still
  // in-flight when submit fires, the new clip may not yet be in the DB.
  // Accepted tradeoff — even with the race, strictly better than the previous
  // "stale until page reload" behavior.
  const getClipHistory = useCallback(async (): Promise<Record<string, unknown>> => {
    if (!userId || userId === "anon") return {};
    const r = await fetchRecentClips(userId, 60);
    if (r.status !== "ok") return {};
    return { clipHistory: aggregateClipHistory(r.clips, new Date()) };
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
    <div className="fight-shell flex h-full flex-col">
      <header className="relative z-20 border-b border-ink/10 bg-background/82 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-6">
          <div className="flex items-center gap-3.5">
            <span className="brand-mark" aria-hidden="true"><GloveMark /></span>
            <div>
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-ember"><span className="corner-label-red">Red</span><span className="corner-label-blue">Blue</span> corner intelligence</p>
              <h1 className="mt-0.5 flex items-baseline gap-2 text-[15px] font-extrabold uppercase leading-none tracking-[-0.02em] sm:text-lg">
                <span>Punch Doctor</span>
                <span className="border border-accent/60 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] text-ember">AI</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/about" className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-muted hover:text-foreground sm:block">
              Protocol / limits
            </Link>
            <ThemeControls />
            <ProfileAvatarLink />
          </div>
        </div>
        <nav className="grid grid-cols-5 gap-1 px-2 pb-2 sm:flex sm:px-6" aria-label="Training rooms">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
                className={`group relative flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden border px-1 py-2 text-[10px] font-medium transition-all sm:min-h-[48px] sm:min-w-28 sm:flex-row sm:justify-start sm:gap-1.5 sm:px-3 sm:py-2.5 sm:text-xs ${
                  isActive
                    ? "border-accent/55 bg-gradient-to-br from-accent-surface/80 to-surface-2/90 text-foreground shadow-[0_0_28px_var(--glow-shadow)]"
                    : "border-transparent text-muted hover:border-ink/10 hover:bg-ink/[.035] hover:text-foreground"
                }`}
              >
                <span className={`hidden font-mono text-[9px] tracking-wider sm:inline ${isActive ? "text-ember" : "text-ink/25"}`}>0{index + 1}</span>
                <Icon size={15} aria-hidden="true" className={isActive ? "text-ember" : ""} />
                <span className="truncate sm:hidden" aria-hidden="true">{tab.shortLabel}</span>
                <span className="hidden truncate sm:inline" aria-hidden="true">{tab.label}</span>
                {isActive && <span className="absolute inset-x-2 bottom-0 h-px bg-ember shadow-[0_0_10px_var(--accent)]" />}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="relative z-10 flex-1 overflow-hidden">
        {activeTab === "technique" && (
          <div className="app-room h-full p-2 sm:p-3">
            <div className="h-full overflow-hidden rounded-[24px] border border-ink/10 shadow-[0_32px_100px_var(--glow-shadow)]">
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
                extraContextProvider={getClipHistory}
              />
              </ErrorBoundary>
            </div>
          </div>
        )}
        {activeTab === "drills" && (
          <div className="app-room flex h-full flex-col overflow-hidden">
            <RoomMasthead
              index="02"
              kicker="Workrate lab"
              title="Build the round."
              description="Turn your style into deliberate rounds, precise constraints, and repeatable work."
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
            <ErrorBoundary label="Drill program">
              <DrillProgramView
                userId={userId}
                onSwitchTab={(tabId) => setActiveTab(tabId as TabId)}
              />
            </ErrorBoundary>
            <div className="border-t border-border my-4" />
            <ErrorBoundary label="Drills chat">
              <div className="flex flex-col pb-6">
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
                  extraContextProvider={getClipHistory}
                />
              </div>
            </ErrorBoundary>
            </div>
          </div>
        )}
        {activeTab === "coach" && (
          <div className="app-room flex h-full flex-col overflow-hidden">
            <RoomMasthead
              index="03"
              kicker="Your corner"
              title="Between rounds, we work."
              description="Log the session, review the tape, and turn what happened into the next adjustment."
            />
            <div className="min-h-0 flex-1">
              <ErrorBoundary label="My Coach">
                <CoachTab userId={userId} />
              </ErrorBoundary>
            </div>
          </div>
        )}
        {activeTab === "style" && (
          <div className="app-room flex h-full flex-col overflow-hidden">
            <RoomMasthead
              index="04"
              kicker="Fighter ID"
              title="Know the fighter you're becoming."
              description="Map your instincts, physical tools, and tactical preferences into a style you can train."
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ErrorBoundary label="Find Your Style">
                <StyleFinderTab
                  userId={userId}
                  onSwitchToChat={(query) => {
                    setCoachQuery(query);
                    setActiveTab("technique");
                  }}
                />
              </ErrorBoundary>
            </div>
          </div>
        )}
        {activeTab === "games" && (
          <div className="app-room flex h-full flex-col overflow-hidden">
            <RoomMasthead
              index="05"
              kicker="Reaction arcade"
              title="Train the eyes. Sharpen the trigger."
              description="Fast, measurable cognition work built around the decisions fighters make under pressure."
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ErrorBoundary label="Games">
                <GamesHub userId={userId} />
              </ErrorBoundary>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function GloveMark() {
  // Brand mark: the glove artwork rendered as a CSS mask so it tints to the
  // active corner (--accent: red or blue) and breathes a matching glow. See
  // .glove-mark in globals.css.
  return <span className="glove-mark" aria-hidden="true" />;
}

function ThemeControls() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [corner, setCorner] = useState<"red" | "blue">("red");

  useEffect(() => {
    // Read whatever the pre-paint boot script applied — external DOM state,
    // only knowable post-mount (same pattern as the ?q= seed effect above).
    const d = document.documentElement.dataset;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (d.theme === "light") setTheme("light");
    if (d.corner === "blue") setCorner("blue");
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("pd-theme", next);
  };

  const toggleCorner = () => {
    const next = corner === "red" ? "blue" : "red";
    setCorner(next);
    document.documentElement.dataset.corner = next;
    localStorage.setItem("pd-corner", next);
  };

  const btn =
    "flex h-9 w-9 items-center justify-center border border-ink/15 text-muted hover:border-ember hover:text-foreground";

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={toggleTheme}
        className={btn}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Light mode" : "Dark mode"}
      >
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <button
        onClick={toggleCorner}
        className={btn}
        aria-label={corner === "red" ? "Switch to blue corner" : "Switch to red corner"}
        title={corner === "red" ? "Blue corner" : "Red corner"}
      >
        <span className="block h-2.5 w-2.5 rotate-45 bg-accent" />
      </button>
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
      className="relative flex h-9 w-9 items-center justify-center border border-accent/40 bg-accent-surface/70 font-mono text-[10px] font-semibold text-ember shadow-[0_0_24px_var(--glow-shadow)] hover:border-ember hover:bg-accent-surface"
    >
      {initials || <User size={14} aria-hidden />}
    </Link>
  );
}

export default function Home() {
  return <AppContent />;
}
