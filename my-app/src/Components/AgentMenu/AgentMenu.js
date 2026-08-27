import { useState, useEffect, useRef } from 'react';
import { serializeCanvasContext } from '../../utils/serializeCanvasContext';
import { chatWithAgent, listAgentModels } from '../../api/agentApi';

const AgentMenu = ({ isOpen, nodes, edges, cycleName, onApplyCycle }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeModelLabel, setActiveModelLabel] = useState('Gemini 3.1 Flash-Lite (Free Tier)');
    const [usedFallback, setUsedFallback] = useState(false);
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const result = await listAgentModels();
            if (cancelled || !result.ok) return;

            const list = result.data?.models ?? [];
            const preferred =
                list.find((m) => m.id === result.data?.defaultModelId) ||
                list.find((m) => m.available) ||
                list[0];
            if (preferred?.label) {
                setActiveModelLabel(preferred.label);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const handleClear = () => {
        setMessages([]);
        setInput('');
    };

    const handleSend = async (event) => {
        event.preventDefault();
        const text = input.trim();
        if (!text || loading) return;

        const userMessage = { role: 'user', content: text };
        const nextMessages = [...messages, userMessage];
        setMessages(nextMessages);
        setInput('');
        setLoading(true);

        try {
            const canvasContext = serializeCanvasContext(nodes, edges, cycleName);
            const chatMessages = nextMessages.map(({ role, content }) => ({ role, content }));
            const result = await chatWithAgent({
                messages: chatMessages,
                canvasContext,
            });

            if (!result.ok) {
                setMessages((prev) => [...prev, {
                    role: 'assistant',
                    content: `Error: ${result.error}`,
                }]);
                return;
            }

            if (result.modelLabel) {
                setActiveModelLabel(result.modelLabel);
                setUsedFallback(Boolean(result.usedFallback));
            }

            if (result.type === 'cycle' && result.cycle) {
                onApplyCycle(result.cycle);
            }

            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: result.reply,
            }]);
        } catch {
            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: 'Could not reach the server. Make sure the backend is running on port 5001.',
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            handleSend(e);
        }
    };

    return (
        <aside className={`AgentMenu ${isOpen ? 'open' : 'closed'}`}>
            <div className="AgentMenu__panel-header">
                <span className="AgentMenu__title">Agent Assistant</span>
                <div className="AgentMenu__model-status">
                    <span className="AgentMenu__model-status-label">Model</span>
                    <span className="AgentMenu__model-status-value">
                        {activeModelLabel}
                        {usedFallback ? ' (fallback)' : ''}
                    </span>
                </div>
            </div>

            <div className="AgentMenu__messages">
                {messages.length === 0 && (
                    <p className="AgentMenu__empty">
                        Ask about lab workflows, cycles, or MOSMAGE nodes.
                    </p>
                )}
                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`AgentMenu__message AgentMenu__message--${msg.role}`}
                    >
                        <span className="AgentMenu__message-label">
                            {msg.role === 'user' ? 'You' : 'Assistant'}
                        </span>
                        <p className="AgentMenu__message-content">{msg.content}</p>
                    </div>
                ))}
                {loading && (
                    <div className="AgentMenu__message AgentMenu__message--assistant">
                        <span className="AgentMenu__message-label">Assistant</span>
                        <p className="AgentMenu__message-content AgentMenu__message--thinking">Thinking…</p>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            <form className="AgentMenu__composer" onSubmit={handleSend}>
                <textarea
                    className="AgentMenu__input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about lab workflows… (Enter to send, Shift+Enter for newline)"
                    rows={3}
                    disabled={loading}
                />
                <div className="AgentMenu__composer-actions">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleClear}
                        disabled={loading}
                    >
                        Clear
                    </button>
                    <button
                        type="submit"
                        className="btn-secondary AgentMenu__send-btn"
                        aria-label="Send message"
                        disabled={loading || !input.trim()}
                    >
                        ↑
                    </button>
                </div>
            </form>
        </aside>
    );
};

export default AgentMenu;
