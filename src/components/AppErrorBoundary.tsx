/**
 * AppErrorBoundary — top-level crash guard.
 *
 * A single unguarded runtime error (e.g. reading `.length` of undefined
 * during a render) otherwise unmounts the whole React tree and leaves a
 * blank screen. This boundary keeps the app visible, shows the real
 * message + component stack, and offers a recovery path.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  stack: string | null;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the details in the console so they are recoverable from logs.
    console.error("[AppErrorBoundary]", error, info.componentStack);
    this.setState({ stack: info.componentStack ?? null });
  }

  handleReset = () => {
    this.setState({ error: null, stack: null });
  };

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-background paper-texture flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-sm border border-border bg-card p-6 space-y-4">
          <h1 className="font-display text-lg font-bold text-foreground">
            Something broke while rendering this view
          </h1>
          <p className="text-sm text-muted-foreground">
            The rest of the app is still running — nothing was lost. Details below.
          </p>
          <pre className="max-h-40 overflow-auto rounded-sm bg-muted p-3 text-[11px] text-foreground whitespace-pre-wrap">
            {error.message}
          </pre>
          {stack && (
            <pre className="max-h-40 overflow-auto rounded-sm bg-muted p-3 text-[10px] text-muted-foreground whitespace-pre-wrap">
              {stack.trim()}
            </pre>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={this.handleReset}>
              Try again
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
