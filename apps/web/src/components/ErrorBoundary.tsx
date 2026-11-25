import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Pega erro de renderizacao de uma tela. Sem isso um erro numa tela deixa o app inteiro em branco.
 * Usa so marcacao simples (sem contextos), para continuar funcionando mesmo se um provedor quebrar.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro ao desenhar a tela', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="view on">
        <div className="empty" role="alert">
          <div className="ico"><i className="ti ti-bug" /></div>
          <h2>Algo deu errado nesta tela</h2>
          <p>Seus dados estão seguros. Recarregue a página; se continuar, avise o suporte com o que você estava fazendo.</p>
          <button type="button" className="btn primary" onClick={() => window.location.reload()}><i className="ti ti-refresh" />Recarregar</button>
        </div>
      </section>
    );
  }
}
