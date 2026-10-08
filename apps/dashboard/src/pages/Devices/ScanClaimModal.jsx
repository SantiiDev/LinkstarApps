import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useOrg } from '../../context/OrgContext';
import Icon from '../../components/Icon/Icon';

/*
 * Vincular un expositor escaneando su QR de vinculación (o escribiendo el código).
 *
 * ── Qué QR se escanea ─────────────────────────────────────────────────────
 * NO el grande del frente: ese lleva a l.linkstarapp.com/d/<public_id>, lo
 * escanea cualquier cliente y por eso no puede servir para reclamar el aparato
 * (alguien en la mesa podría vincularlo a su cuenta antes que el dueño). El de
 * vinculación es uno chico impreso en la base, junto al código XXXX-XXXX, y
 * contiene https://app.linkstarapp.com/panel/dispositivos?vincular=XXXX-XXXX
 * (provision-devices.js imprime esa URL). Así, escanearlo con la cámara común
 * del celular también abre el panel con este modal ya completado.
 *
 * El escaneo lo hace `qr-scanner`, que se importa recién al usar la cámara o
 * una imagen: no pesa en la carga del panel. Usa BarcodeDetector donde existe y
 * un worker donde no (Safari, Firefox). Nada sale del navegador.
 *
 * La vinculación la valida claim_device() en la base (rol, código, doble
 * vinculación y límite de plan); esto sólo consigue el código.
 */

const CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

const CLAIM_ERRORS = {
  invalid_claim_code: 'Ese código no existe. Revisá que esté igual al impreso en la base del expositor.',
  already_claimed: 'Ese expositor ya está vinculado a otra cuenta.',
  plan_limit_reached: 'Alcanzaste el límite de dispositivos de tu plan. Mejorá el plan para sumar más.',
  subscription_inactive: 'Tu suscripción no está activa. Revisá tu plan para continuar.',
};

const PUBLIC_QR_MESSAGE =
  'Ese es el QR que escanean tus clientes. El de vinculación es el chico de la base del expositor, junto al código de 8 caracteres.';

/* Lo leído → { code } | { publicQr } | { unknown }. */
function parseScanned(text) {
  const raw = (text ?? '').trim();
  if (CODE_RE.test(raw)) return { code: raw.toUpperCase() };
  try {
    const url = new URL(raw);
    const code = url.searchParams.get('vincular')?.trim();
    if (code && CODE_RE.test(code)) return { code: code.toUpperCase() };
    if (/\/d\/[^/]+/.test(url.pathname)) return { publicQr: true };
  } catch {
    // No era una URL: cae al «no lo reconocemos».
  }
  return { unknown: true };
}

function loadScanner() {
  return import('qr-scanner').then((m) => m.default);
}

export default function ScanClaimModal({ initialCode = '', onClose, onClaimed }) {
  const { org } = useOrg();
  const [tab, setTab] = useState('camera');
  const [camera, setCamera] = useState('idle'); // idle | starting | running | denied | unavailable
  const [manual, setManual] = useState(Boolean(initialCode));
  const [code, setCode] = useState(initialCode ? initialCode.toUpperCase() : '');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [success, setSuccess] = useState(false);
  const [dragging, setDragging] = useState(false);

  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const fileRef = useRef(null);

  const stopCamera = useCallback(() => {
    scannerRef.current?.destroy();
    scannerRef.current = null;
  }, []);

  // La cámara se apaga siempre al cerrar el modal.
  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const claim = useCallback(async (value) => {
    const clean = value.trim().toUpperCase();
    if (!clean || claiming) return;
    setError('');
    setNotice('');
    setClaiming(true);
    const { error: rpcError } = await supabase.rpc('claim_device', {
      p_claim_code: clean,
      p_org_id: org?.organization_id,
    });
    setClaiming(false);
    if (rpcError) {
      setCode(clean);
      setManual(true);
      setError(CLAIM_ERRORS[rpcError.hint] || 'No pudimos vincular el expositor. Revisá el código e intentá de nuevo.');
      return;
    }
    setSuccess(true);
    onClaimed?.();
  }, [claiming, org?.organization_id, onClaimed]);

  /* Lo que devolvió la cámara o la imagen. */
  const handleScanned = useCallback((text) => {
    const parsed = parseScanned(text);
    if (parsed.code) {
      stopCamera();
      setCamera('idle');
      claim(parsed.code);
    } else if (parsed.publicQr) {
      setNotice(PUBLIC_QR_MESSAGE);
    } else {
      setNotice('Ese QR no es de un expositor Linkstar. Buscá el QR chico de la base, junto al código de vinculación.');
    }
  }, [claim, stopCamera]);

  async function openCamera() {
    setNotice('');
    setError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamera('unavailable');
      return;
    }
    setCamera('starting');
    try {
      const QrScanner = await loadScanner();
      if (!(await QrScanner.hasCamera())) {
        setCamera('unavailable');
        return;
      }
      stopCamera();
      const scanner = new QrScanner(videoRef.current, (result) => handleScanned(result.data), {
        preferredCamera: 'environment',
        returnDetailedScanResult: true,
        maxScansPerSecond: 8,
      });
      scannerRef.current = scanner;
      await scanner.start();
      setCamera('running');
    } catch (err) {
      console.error('No se pudo abrir la cámara:', err);
      stopCamera();
      setCamera(String(err?.name ?? err).includes('NotAllowed') || String(err).includes('denied') ? 'denied' : 'unavailable');
    }
  }

  async function scanFile(file) {
    if (!file) return;
    setNotice('');
    setError('');
    try {
      const QrScanner = await loadScanner();
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      handleScanned(result.data);
    } catch {
      setNotice('No encontramos un QR en esa imagen. Probá con una foto más cerca y con buena luz.');
    }
  }

  function switchTab(next) {
    if (next === tab) return;
    if (next !== 'camera') {
      stopCamera();
      setCamera('idle');
    }
    setNotice('');
    setTab(next);
  }

  if (success) {
    return (
      <div className="device-modal-overlay" onClick={onClose}>
        <div className="scan-modal scan-modal--done" role="dialog" aria-modal="true" aria-labelledby="scan-modal-title" onClick={(e) => e.stopPropagation()}>
          <div className="scan-modal__success-icon"><Icon name="check" size={28} /></div>
          <h3 className="scan-modal__title" id="scan-modal-title">¡Expositor vinculado!</h3>
          <p className="scan-modal__subtitle">Ya aparece en tu lista. Sus escaneos se suman todos los días a las 8:00.</p>
          <button type="button" className="scan-modal__primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="device-modal-overlay" onClick={onClose}>
      <div className="scan-modal" role="dialog" aria-modal="true" aria-labelledby="scan-modal-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="scan-modal__close" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={16} /></button>

        <h3 className="scan-modal__title" id="scan-modal-title">Escanear código QR</h3>
        <p className="scan-modal__subtitle">Escaneá el QR de vinculación que viene en la base de tu expositor</p>

        {!manual && (
          <>
            <div className="scan-modal__tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'camera'} className={`scan-modal__tab${tab === 'camera' ? ' scan-modal__tab--active' : ''}`} onClick={() => switchTab('camera')}>
                <Icon name="camera" size={15} /> Cámara
              </button>
              <button type="button" role="tab" aria-selected={tab === 'image'} className={`scan-modal__tab${tab === 'image' ? ' scan-modal__tab--active' : ''}`} onClick={() => switchTab('image')}>
                <Icon name="image" size={15} /> Subir imagen
              </button>
            </div>

            {tab === 'camera' && (
              <div className={`scan-modal__area${camera === 'running' || camera === 'starting' ? ' scan-modal__area--live' : ''}`}>
                {/* El video existe siempre (qr-scanner necesita el elemento antes de
                    arrancar); se ve sólo con la cámara encendida. */}
                <video ref={videoRef} className="scan-modal__video" playsInline muted />
                {(camera === 'running' || camera === 'starting') && (
                  <>
                    <span className="scan-modal__frame" aria-hidden="true" />
                    <span className="scan-modal__live-hint">
                      {camera === 'starting' ? 'Abriendo la cámara…' : 'Apuntá al QR chico de la base'}
                    </span>
                  </>
                )}
                {(camera === 'idle' || camera === 'denied' || camera === 'unavailable') && (
                  <div className="scan-modal__placeholder">
                    <span className="scan-modal__bubble"><Icon name="camera" size={26} /></span>
                    <p className="scan-modal__ph-title">
                      {camera === 'idle' && 'Listo para escanear'}
                      {camera === 'denied' && 'No tenemos permiso para usar la cámara'}
                      {camera === 'unavailable' && 'No encontramos una cámara'}
                    </p>
                    <p className="scan-modal__ph-text">
                      {camera === 'idle' && 'Tocá el botón para activar la cámara trasera.'}
                      {camera === 'denied' && 'Habilitala en los permisos del navegador, o subí una foto del QR.'}
                      {camera === 'unavailable' && 'Probá subiendo una foto del QR o escribiendo el código.'}
                    </p>
                    {camera === 'idle' || camera === 'denied' ? (
                      <button type="button" className="scan-modal__primary" onClick={openCamera} disabled={claiming}>
                        <Icon name="camera" size={16} /> Abrir cámara
                      </button>
                    ) : (
                      <button type="button" className="scan-modal__primary" onClick={() => switchTab('image')}>
                        <Icon name="upload" size={16} /> Subir una foto
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'image' && (
              <div
                className={`scan-modal__area scan-modal__area--drop${dragging ? ' scan-modal__area--dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); scanFile(e.dataTransfer.files?.[0]); }}
              >
                <div className="scan-modal__placeholder">
                  <span className="scan-modal__bubble scan-modal__bubble--soft"><Icon name="upload" size={24} /></span>
                  <p className="scan-modal__ph-title">Subí una imagen con el código QR</p>
                  <p className="scan-modal__ph-text">Elegí o arrastrá una foto del QR de la base.</p>
                  <button type="button" className="scan-modal__primary scan-modal__primary--small" onClick={() => fileRef.current?.click()} disabled={claiming}>
                    <Icon name="upload" size={15} /> Elegir imagen
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => { scanFile(e.target.files?.[0]); e.target.value = ''; }}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {manual && (
          <form className="scan-modal__manual" onSubmit={(e) => { e.preventDefault(); claim(code); }}>
            <label className="scan-modal__manual-label" htmlFor="scan-modal-code">Código de vinculación</label>
            <input
              id="scan-modal-code"
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder="Ej. 7K2M-94XQ"
              value={code}
              maxLength={9}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); if (error) setError(''); }}
              autoFocus
            />
            <span className="scan-modal__manual-hint">Son 8 caracteres impresos en la base del expositor, junto al QR chico.</span>
            <button type="submit" className="scan-modal__primary" disabled={!code.trim() || claiming}>
              {claiming ? 'Vinculando…' : 'Vincular expositor'}
            </button>
          </form>
        )}

        {claiming && !manual && <p className="scan-modal__status">Vinculando…</p>}
        {notice && <p className="scan-modal__notice" role="status">{notice}</p>}
        {error && <p className="scan-modal__error" role="alert">{error}</p>}

        <button
          type="button"
          className="scan-modal__switch"
          onClick={() => { stopCamera(); setCamera('idle'); setNotice(''); setError(''); setManual((m) => !m); }}
        >
          {manual
            ? <><Icon name="camera" size={14} /> Escanear el QR</>
            : <><Icon name="keyboard" size={14} /> ¿No podés escanear? Ingresá el código</>}
        </button>
      </div>
    </div>
  );
}
