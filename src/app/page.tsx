"use client";

import { useState } from "react";
import { MessageSquare, Video, User, Dumbbell } from "lucide-react";
import { ChatTab } from "@/components/chat-tab";
import { VideoReviewTab } from "@/components/video-review-tab";
import { StyleFinderTab } from "@/components/style-finder-tab";

const tabs = [
  { id: "technique", label: "Technique", icon: MessageSquare, description: "Ask about punching mechanics" },
  { id: "drills", label: "Drills", icon: Dumbbell, description: "Exercises & training" },
  { id: "video", label: "Video Review", icon: Video, description: "Analyze your footage" },
  { id: "style", label: "Find Your Style", icon: User, description: "Discover your fighting style" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("technique");

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-bold text-white text-sm">
            PD
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Punch Doctor AI</h1>
            <p className="text-xs text-muted">Powered by Alex Wiant DC&apos;s methodology</p>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex border-b border-border px-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
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
              "How do I generate more power in my jab?",
              "Explain the 4 phases of a power punch",
              "Why should I land with the last 3 knuckles?",
              "What's wrong with breathing out when I punch?",
            ]}
          />
        )}
        {activeTab === "drills" && (
          <ChatTab
            systemContext="drills"
            placeholder="Ask about exercises, training routines, bag work..."
            suggestions={[
              "What exercises help with hip rotation?",
              "How do I practice the High Five exercise?",
              "Give me a bag work routine for power",
              "How should I wrap my hands?",
            ]}
          />
        )}
        {activeTab === "video" && <VideoReviewTab />}
        {activeTab === "style" && <StyleFinderTab />}
      </main>
    </div>
  );
}
