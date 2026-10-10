import React from 'react';

/**
 * Loads a cycle from the database
 * 
 */
export default function LoadCycleDialog({
  open,
  cycles,
  onClose,
  onLoad,
  onDelete,
}) {
  if (!open) return null;

  return (
    <div
      className="loadmenu-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loadmenu-title"
    >
      <div className="loadmenu">
        <div className="loadmenu__header">
          <div id="loadmenu-title" className="loadmenu__title">
            Load cycle
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="loadmenu__body">
          {cycles.length === 0 ? (
            <p className="loadmenu__empty">No saved cycles found.</p>
          ) : (
            <ul className="loadmenu__list">
              {cycles.map((cycle) => (
                <li key={cycle.id} className="loadmenu__row">
                  <button
                    type="button"
                    className="loadmenu__item-btn"
                    onClick={() => onLoad(cycle)}
                  >
                    <span className="loadmenu__item-name">{cycle.name}</span>
                  </button>
                  <button
                    type="button"
                    className="loadmenu__delete-btn"
                    title="Delete this cycle"
                    onClick={() => onDelete(cycle.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

