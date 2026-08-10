import { useEffect, useRef, useState } from 'react';
import './DateField.css';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function sameDay(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(d) {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Lunes-primero: getDay() da 0=domingo..6=sábado, lo rotamos para que 0=lunes.
function buildGrid(viewDate) {
  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const leading = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();

  const cells = [];
  for (let i = leading; i > 0; i--) {
    cells.push({ date: new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(viewDate.getFullYear(), viewDate.getMonth(), d), inMonth: true });
  }
  while (cells.length < 42) {
    const next = new Date(cells[cells.length - 1].date);
    next.setDate(next.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }
  return cells;
}

export default function DateField({ value, onChange, placeholder = 'dd/mm/aaaa', triggerClassName = '' }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value || new Date());
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    if (!open) setViewDate(value || new Date());
    setOpen((o) => !o);
  }

  const today = new Date();
  const cells = buildGrid(viewDate);

  return (
    <div className="ls-date" ref={rootRef}>
      <button type="button" className={`ls-date__trigger ${triggerClassName}`} onClick={toggleOpen} aria-haspopup="dialog" aria-expanded={open}>
        <span className={`ls-date__label ${!value ? 'ls-date__label--placeholder' : ''}`}>{value ? formatDate(value) : placeholder}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {open && (
        <div className="ls-date__panel" role="dialog">
          <div className="ls-date__header">
            <div className="ls-date__nav-group">
              <button type="button" className="ls-date__nav" onClick={() => setViewDate((d) => new Date(d.getFullYear() - 1, d.getMonth(), 1))} aria-label="Año anterior">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 17 13 12 18 7" /><polyline points="12 17 7 12 12 7" /></svg>
              </button>
              <button type="button" className="ls-date__nav" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} aria-label="Mes anterior">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            </div>
            <span className="ls-date__month">{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
            <div className="ls-date__nav-group">
              <button type="button" className="ls-date__nav" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} aria-label="Mes siguiente">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
              <button type="button" className="ls-date__nav" onClick={() => setViewDate((d) => new Date(d.getFullYear() + 1, d.getMonth(), 1))} aria-label="Año siguiente">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 17 11 12 6 7" /><polyline points="12 17 17 12 12 7" /></svg>
              </button>
            </div>
          </div>

          <div className="ls-date__weekdays">
            {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
          </div>

          <div className="ls-date__grid">
            {cells.map((cell, i) => (
              <button
                type="button"
                key={i}
                className={`ls-date__day ${!cell.inMonth ? 'ls-date__day--muted' : ''} ${sameDay(cell.date, value) ? 'ls-date__day--selected' : ''} ${sameDay(cell.date, today) ? 'ls-date__day--today' : ''}`}
                onClick={() => { onChange(cell.date); setOpen(false); }}
              >
                {cell.date.getDate()}
              </button>
            ))}
          </div>

          {value && (
            <button type="button" className="ls-date__clear" onClick={() => { onChange(null); setOpen(false); }}>
              Limpiar fecha
            </button>
          )}
        </div>
      )}
    </div>
  );
}
