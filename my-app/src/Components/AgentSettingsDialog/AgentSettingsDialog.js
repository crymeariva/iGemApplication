import { useState, useEffect } from 'react';
import { getAgentKeyStatus, saveAgentKeys } from '../../api/agentApi';

/**
 * BYOK settings: save Gemini / OpenRouter keys on this machine.
 * open/onClose controlled by App (same pattern as LoadCycleDialog).
 */
export default function AgentSettingsDialog({ open, onClose }) {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openRouterApiKey, setOpenRouterApiKey] = useState('');
  const [status, setStatus] = useState({
    geminiConfigured: false,
    openRouterConfigured: false,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // When the dialog opens, ask the server which keys exist (booleans only).
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      const result = await getAgentKeyStatus();
      if (cancelled || !result.ok) return;
      setStatus(result.data);
      setGeminiApiKey('');
      setOpenRouterApiKey('');
      setMessage('');
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const applySaveResult = (result, successMessage) => {
    if (!result.ok) {
      setMessage(result.error || 'Save failed');
      return;
    }
    setStatus(result.data);
    setGeminiApiKey('');
    setOpenRouterApiKey('');
    setMessage(successMessage);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    // Blank field = leave that key unchanged.
    const payload = {};
    if (geminiApiKey.trim()) payload.geminiApiKey = geminiApiKey.trim();
    if (openRouterApiKey.trim()) payload.openRouterApiKey = openRouterApiKey.trim();

    if (!payload.geminiApiKey && !payload.openRouterApiKey) {
      setSaving(false);
      setMessage('Nothing to save. Paste a key, or use Clear.');
      return;
    }

    const result = await saveAgentKeys(payload);
    setSaving(false);
    applySaveResult(result, 'Saved. Keys stay on this device.');
  };

  const handleClearGemini = async () => {
    setSaving(true);
    setMessage('');
    const result = await saveAgentKeys({ geminiApiKey: '' });
    setSaving(false);
    applySaveResult(result, 'Gemini key cleared.');
  };

  const handleClearOpenRouter = async () => {
    setSaving(true);
    setMessage('');
    const result = await saveAgentKeys({ openRouterApiKey: '' });
    setSaving(false);
    applySaveResult(result, 'OpenRouter key cleared.');
  };

  return (
    <div
      className="loadmenu-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-settings-title"
    >
      <div className="loadmenu">
        <div className="loadmenu__header">
          <div id="agent-settings-title" className="loadmenu__title">
            Agent Settings
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="loadmenu__body agent-settings" onSubmit={handleSave}>
          <p className="agent-settings__hint">
            Optional. Keys are stored on this machine only. Leave a field blank to keep the current key.
          </p>

          <div className="agent-settings__field">
            <label className="agent-settings__label" htmlFor="agent-gemini-key">
              Gemini
              <span className="agent-settings__status">
                {status.geminiConfigured ? '(configured)' : '(not set)'}
              </span>
            </label>
            <input
              id="agent-gemini-key"
              className="agent-settings__input"
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="Paste Gemini API key"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClearGemini}
              disabled={saving || !status.geminiConfigured}
            >
              Clear
            </button>
          </div>

          <div className="agent-settings__field">
            <label className="agent-settings__label" htmlFor="agent-openrouter-key">
              OpenRouter
              <span className="agent-settings__status">
                {status.openRouterConfigured ? '(configured)' : '(not set)'}
              </span>
            </label>
            <input
              id="agent-openrouter-key"
              className="agent-settings__input"
              type="password"
              value={openRouterApiKey}
              onChange={(e) => setOpenRouterApiKey(e.target.value)}
              placeholder="Paste OpenRouter API key"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClearOpenRouter}
              disabled={saving || !status.openRouterConfigured}
            >
              Clear
            </button>
          </div>

          {message && <p className="agent-settings__message">{message}</p>}

          <div className="agent-settings__actions">
            <button type="submit" className="btn-secondary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
