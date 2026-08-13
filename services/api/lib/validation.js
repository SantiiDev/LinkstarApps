import { z } from 'zod';

// Validación estructural de lo que manda el cliente en las rutas de checkout.
// No reemplaza un catálogo de precios server-side (eso queda pendiente, ver
// CLAUDE.md "no tocar checkout sin confirmar dirección") — esto sólo evita
// tipos raros, negativos, strings vacíos y totales absurdos.
export const cartItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    key: z.union([z.string(), z.number()]).optional(),
    name: z.string().min(1).max(200),
    color: z.string().max(40).optional(),
    qty: z.number().int().positive().max(100),
    price: z.number().positive().max(10_000_000),
    isBundle: z.boolean().optional(),
    items: z.array(z.any()).optional(),
  })
  .refine((item) => item.id !== undefined || item.key !== undefined, {
    message: 'Cada item necesita id o key',
  });

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  zip: z.string().trim().max(20).optional(),
});

export const createPreferenceSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  customer: customerSchema,
  payMethod: z.string().max(20).optional(),
});

export const orderTransferSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  customer: customerSchema,
});

export const processPaymentSchema = z.object({
  formData: z.object({
    token: z.string().min(1),
    transaction_amount: z.number().positive().max(10_000_000),
    installments: z.number().int().positive().max(24),
    payment_method_id: z.string().min(1),
    issuer_id: z.union([z.string(), z.number()]).optional(),
    payer: z.object({
      email: z.string().trim().email(),
      identification: z
        .object({ type: z.string().optional(), number: z.string().optional() })
        .optional(),
    }),
  }),
  customer: customerSchema,
  cartItems: z.array(cartItemSchema).optional(),
});

// Suscripción mensual al dashboard. Sólo viaja el código del plan: el precio
// y los días de prueba se leen de la tabla `plans` en el servidor. Mismo
// criterio que lib/catalog.js para los expositores — un importe que viene del
// body es un importe que el cliente eligió.
export const subscriptionCheckoutSchema = z.object({
  planCode: z.string().trim().min(1).max(40),
});

// Middleware genérico: valida req.body contra un schema de Zod. 400 con el
// primer error legible si falla, y reemplaza req.body por los datos ya
// parseados/coercionados (trim, etc.) si pasa.
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      return res.status(400).json({
        error: 'Datos inválidos',
        detail: issue ? `${issue.path.join('.')}: ${issue.message}` : undefined,
      });
    }
    req.body = result.data;
    next();
  };
}
