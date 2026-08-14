import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useOrg } from '../../context/OrgContext';
import { ONBOARDING_ROUTES } from '../../lib/routes';
import OnboardingLayout from './OnboardingLayout';

/* Identificador legible de la organización. La base lo valida con
 * ^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$ (0002_tenancy.sql), así que acá se
 * normaliza igual: sin acentos, sin ñ, sin guiones colgando de las puntas.
 * Se muestra editable porque es único a nivel global y el primer intento
 * puede estar tomado. */
function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento que dejó suelta NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export default function CreateOrg() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh } = useOrg();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleNameChange(value) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const finalSlug = slugify(slug || name);
    if (finalSlug.length < 3) {
      setError('El identificador necesita al menos 3 letras o números.');
      return;
    }

    setSubmitting(true);

    // El insert va con el cliente anon bajo RLS: la política
    // organizations_insert exige created_by = auth.uid(), y el trigger
    // organizations_bootstrap crea en la misma transacción la membresía de
    // owner y la suscripción inicial (plan gratis, sin elegir todavía).
    //
    // OJO: no encadenar .select() acá. Pediría la fila de vuelta con RETURNING,
    // que se evalúa ANTES de que corra el trigger AFTER INSERT — o sea, antes
    // de que exista la membresía que la política organizations_select necesita
    // para dejarte ver la fila. Falla con 42501 aunque el insert haya andado.
    // Los datos de la organización se leen después, con refresh().
    const { error: insertError } = await supabase.from('organizations').insert({
      name: name.trim(),
      slug: finalSlug,
      tax_id: taxId.trim() || null,
      created_by: user.id,
    });

    if (insertError) {
      setSubmitting(false);
      setError(
        insertError.code === '23505'
          ? 'Ese identificador ya está en uso. Probá con otro.'
          : 'No se pudo crear la empresa. Revisá los datos e intentá de nuevo.'
      );
      return;
    }

    // Sin esto el guard seguiría viendo "sin organización" y rebotaría acá.
    await refresh();
    navigate(ONBOARDING_ROUTES.plan, { replace: true });
  }

  return (
    <OnboardingLayout
      step={1}
      title="Creá tu empresa"
      subtitle="Es el espacio donde van a vivir tus locales, tus expositores y tus métricas. Si tenés varias sucursales, se cargan después: todas dentro de esta misma empresa."
    >
      {error && <div className="onb-error">{error}</div>}

      <div className="onb-card">
        <form className="onb-form" onSubmit={handleSubmit}>
          <label className="onb-field">
            <span className="onb-label">Nombre del negocio</span>
            <input
              type="text"
              className="onb-input"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Café Rivadavia"
              maxLength={120}
              required
              autoFocus
            />
          </label>

          <label className="onb-field">
            <span className="onb-label">Identificador</span>
            <input
              type="text"
              className="onb-input"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="cafe-rivadavia"
              maxLength={40}
              required
            />
            <span className="onb-hint">
              Sólo minúsculas, números y guiones. Se usa internamente y no se puede repetir.
            </span>
          </label>

          <label className="onb-field">
            <span className="onb-label">CUIT (opcional)</span>
            <input
              type="text"
              className="onb-input"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="30-12345678-9"
              maxLength={20}
            />
            <span className="onb-hint">Lo necesitamos para facturarte. Podés cargarlo más adelante.</span>
          </label>

          <button type="submit" className="onb-submit" disabled={submitting}>
            {submitting ? 'Creando…' : 'Continuar'}
          </button>
        </form>
      </div>
    </OnboardingLayout>
  );
}
