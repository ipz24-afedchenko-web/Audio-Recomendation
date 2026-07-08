import React from 'react';
import { withTranslation } from 'react-i18next';
import strings from '../strings';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="empty-state">
            <div className="empty-state-icon">⚠️</div>
            <div className="empty-state-text">{strings.errorBoundary.title}</div>
            <p className="error-boundary-detail">
              {this.state.error?.message || strings.errorBoundary.unknownError}
            </p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              {strings.errorBoundary.reload}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
