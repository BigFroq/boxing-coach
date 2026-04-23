"use client";

import React from "react";

interface Props {
  /** Short label shown in the fallback UI, e.g. "Technique chat" */
  label?: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Non-blocking log. Sentry will pick this up once wired (Phase 4).
    console.error("[ErrorBoundary]", this.props.label ?? "", error, info);
  }

  reset = () => this.setState({ hasError: false, message: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-center">
          <div className="mb-2 text-2xl" role="img" aria-label="Warning">
            ⚠️
          </div>
          <h2 className="mb-2 text-lg font-semibold">
            {this.props.label ? `${this.props.label} hit a snag.` : "Something went wrong."}
          </h2>
          <p className="mb-4 text-sm text-muted">
            The coach is thinking — try again. If it keeps happening, refresh the page.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-surface"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
