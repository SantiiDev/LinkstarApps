import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { recall, remember } from './viewMemory';

/* Como useState, pero lo último que se puso queda en memoria bajo `key`
 * (lib/viewMemory.js): al ir a otra sección y volver, la pantalla arranca con
 * lo que tenía. Se pierde al recargar la página, a propósito, igual que el
 * resto de lo que recuerda el panel.
 *
 * Es para lo que elige o escribe la persona (un selector, un borrador sin
 * guardar), no para datos de la base: para eso está useRememberedData.
 *
 * La clave tiene que incluir la organización (y lo que cambie el valor, como el
 * local elegido). Con `key` null no se recuerda nada. `initial` se toma una
 * vez: pasá una constante. */
export function useRememberedState(key, initial) {
  const userId = useAuth().user?.id ?? null;
  const initialRef = useRef(initial);
  const read = useCallback(
    (k) => (k ? recall(userId, k) ?? initialRef.current : initialRef.current),
    [userId]
  );

  const [state, setState] = useState(() => ({ key, value: read(key) }));

  const set = useCallback((update) => {
    setState((prev) => {
      const base = prev.key === key ? prev.value : read(key);
      const value = typeof update === 'function' ? update(base) : update;
      if (key) remember(key, value);
      return { key, value };
    });
  }, [key, read]);

  // Entre un cambio de clave y el próximo set hay renders: que muestren lo de
  // la clave nueva, nunca lo de la anterior.
  return [state.key === key ? state.value : read(key), set];
}
