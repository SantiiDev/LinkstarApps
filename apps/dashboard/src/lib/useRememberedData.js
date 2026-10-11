import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { recall, remember } from './viewMemory';

/* Carga `load()` y recuerda el resultado en memoria bajo `key`
 * (lib/viewMemory.js): al volver a la pantalla, `data` arranca con lo que se
 * leyó la última vez y se relee por detrás, sin «Leyendo…» de por medio. Si la
 * relectura falla, se queda lo que había.
 *
 * Es para las pantallas que leen Google en vivo a través del API (Perfil,
 * Publicaciones): la ficha puede cambiar en Google, así que se vuelve a leer
 * siempre, pero no hace falta esperar esa lectura para mostrar algo.
 *
 * `key` null = todavía no hay qué cargar (por ejemplo, sin ficha elegida). La
 * clave tiene que incluir todo lo que cambia el resultado (organización, ficha).
 * `reload()` relee sin borrar lo que se muestra. */
export function useRememberedData(key, load) {
  const userId = useAuth().user?.id ?? null;
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  const [state, setState] = useState(() => ({
    key,
    data: key ? recall(userId, key) ?? null : null,
    error: null,
  }));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const known = recall(userId, key);
    setState({ key, data: known ?? null, error: null });
    loadRef.current()
      .then((data) => {
        remember(key, data);
        if (!cancelled) setState({ key, data, error: null });
      })
      .catch((err) => {
        console.error(`No se pudo cargar ${key}:`, err);
        if (!cancelled) setState((prev) => (known ? prev : { key, data: null, error: err }));
      });
    return () => { cancelled = true; };
  }, [key, userId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // Entre el cambio de clave y el efecto hay un render: que no muestre lo de la
  // clave anterior (otra ficha) ni por un instante.
  if (state.key !== key) {
    return { data: key ? recall(userId, key) ?? null : null, error: null, reload };
  }
  return { data: state.data, error: state.error, reload };
}
