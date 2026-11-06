import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Change this (e.g. the pathname) to clear the error and try rendering again. */
  resetKey?: string;
  /** Inside the shell: keep the failure contained to the page area. */
  compact?: boolean;
};

type State = { error: Error | null };

// React 19 unmounts the whole tree on an uncaught render error, which turns one
// bad record into a blank page with no way back. This boundary keeps the app
// usable and reports the failure instead of disappearing.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui] render error:', error, info?.componentStack);
    // fire-and-forget: support can see that it happened, but a failing report
    // must never make things worse
    import('../lib/api')
      .then(({ act }) => act('audit.event', { event: 'ui.error', details: { message: String(error?.message || error).slice(0, 300), at: window.location.pathname } }))
      .catch(() => { /* ignore */ });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const ar = (document.documentElement.lang || '').startsWith('ar');
    const title = ar ? 'حدث خطأ غير متوقع' : 'Something went wrong';
    const body = ar
      ? 'تعذّر عرض هذا الجزء من الصفحة. يمكنك المحاولة مرة أخرى، أو العودة إلى لوحة المعلومات.'
      : 'This part of the page could not be displayed. You can try again, or go back to the dashboard.';
    const retry = ar ? 'إعادة المحاولة' : 'Try again';
    const home = ar ? 'لوحة المعلومات' : 'Go to dashboard';
    const details = ar ? 'التفاصيل التقنية' : 'Technical details';

    const card = (
      <div data-testid="error-boundary" className="max-w-lg w-full rounded-2xl border border-coral/30 bg-coral/5 p-5 flex flex-col gap-3 text-start">
        <div className="text-base font-semibold">{title}</div>
        <div className="text-sm opacity-80">{body}</div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={this.reset} className="h-9 px-3 rounded-lg bg-brand text-white text-sm font-medium">{retry}</button>
          <button type="button" onClick={() => { window.location.href = '/'; }} className="h-9 px-3 rounded-lg border border-black/10 text-sm font-medium">{home}</button>
        </div>
        <details className="text-xs opacity-70">
          <summary className="cursor-pointer">{details}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words" dir="ltr">{String(error?.message || error)}</pre>
        </details>
      </div>
    );

    if (this.props.compact) return <div className="p-6 grid place-items-center">{card}</div>;
    return <div className="min-h-screen grid place-items-center p-6 bg-app">{card}</div>;
  }
}
