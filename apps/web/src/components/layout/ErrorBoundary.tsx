import { Component, type ErrorInfo, type ReactNode } from 'react';
import { zh } from '@/i18n/dict.zh';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  handleHome = (): void => {
    this.setState({ error: null });
    window.location.assign('/');
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const t = zh;

    return (
      <div className="relative flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-2xl">
          <div className="label">§ {t.err.runtimeException}</div>
          <h1 className="mt-2 font-semibold text-6xl font-black italic">
            <span className="text-neon-ember not-italic">{t.err.systemFault}</span>
          </h1>
          <p className="mt-4 text-[12px] text-ink-600">{t.err.faultDesc}</p>

          <pre className="crt-panel mt-6 overflow-auto border-neon-ember/30 p-5 text-[11px] leading-relaxed text-ink-700">
{error.name}: {error.message}
{error.stack ? '\n\n' + error.stack.split('\n').slice(0, 8).join('\n') : ''}
          </pre>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={this.handleReload} className="btn-acid">
              → {t.common.reload.toUpperCase()}
            </button>
            <button type="button" onClick={this.handleHome} className="btn-teal-outline">
              [{t.common.home.toUpperCase()}]
            </button>
          </div>
        </div>
      </div>
    );
  }
}
