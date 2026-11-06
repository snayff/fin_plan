import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/errorReporter";

interface Props {
  children: ReactNode;
  /**
   * Optional static fallback UI. When omitted the built-in fallback with a
   * scoped retry is rendered.
   */
  fallback?: ReactNode;
  /**
   * Human-readable name for this boundary's region (e.g. "auth", "app-content").
   * Forwarded to telemetry so crashes can be attributed to a seam.
   */
  label?: string;
  /** Called when the user triggers the scoped retry, after boundary state resets. */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Route every caught error through the telemetry seam so production
    // crashes are reported, not silently swallowed.
    reportError(error, {
      label: this.props.label,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleRetry = () => {
    // Scoped retry: reset just this boundary so a sibling crash doesn't force a
    // full-page reload. Re-rendering children gives transient failures a chance
    // to recover.
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center min-h-[200px]">
          <p className="text-lg font-medium text-foreground">Something went wrong</p>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Try again, or reload the page if it persists.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={this.handleRetry}>
              Try again
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
            >
              Reload page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
