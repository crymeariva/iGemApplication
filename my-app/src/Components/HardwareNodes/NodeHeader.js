import './HardwareNode.css';

const NodeHeader = ({ label, expanded, onToggle }) => (
    <div className="hardware-node-header hardware-node-header--collapsible">
        {label}
        <button
            type="button"
            className={`node-collapse-btn ${expanded ? '' : 'collapsed'}`}
            onClick={onToggle}
            title={expanded ? 'Hide settings' : 'Show settings'}
        >
            ▾
        </button>
    </div>
);

export default NodeHeader;
