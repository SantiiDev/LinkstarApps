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
    // Sólo para el mail de aviso: qué modelo hay que despachar. Zod descarta
    // las claves que no estén declaradas, así que sin esto el color de cada
    // parte de un combo se perdía antes de llegar al servidor.
    label: z.string().max(120).optional(),
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

// Pedido sin pago online: el comprador confirma en el sitio y el cobro se
// coordina a mano. La dirección y la ciudad son obligatorias acá y opcionales
// en customerSchema porque esto termina en un envío físico — sin dirección, el
// pedido no se puede despachar y el mail de aviso llega incompleto.
export const manualOrderSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  customer: customerSchema.extend({
    address: z.string().trim().min(1).max(300),
    city: z.string().trim().min(1).max(120),
  }),
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

// ─── Ficha de Google (routes/googleProfile.js) ────────────────────────────
// Lista blanca de lo que el panel puede escribir en la ficha. Dirección y
// categorías quedan afuera a propósito: cambiar la dirección dispara una nueva
// verificación de la ficha en Google, y las categorías necesitan un buscador
// contra el catálogo de Google que todavía no existe.
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const timeOfDay = z.object({
  hours: z.number().int().min(0).max(24),
  minutes: z.number().int().min(0).max(59).optional(),
});
const httpUrl = z.string().trim().max(2000).url().refine((u) => /^https?:\/\//i.test(u), 'Tiene que empezar con http(s)://');
const optionalUrl = z.union([httpUrl, z.literal('')]);

export const googleProfileUpdateSchema = z
  .object({
    description: z.string().trim().max(750).optional(),
    primaryPhone: z.string().trim().max(40).optional(),
    additionalPhones: z.array(z.string().trim().min(1).max(40)).max(2).optional(),
    websiteUri: optionalUrl.optional(),
    regularHours: z
      .object({
        periods: z
          .array(z.object({
            openDay: z.enum(DAYS),
            openTime: timeOfDay,
            closeDay: z.enum(DAYS),
            closeTime: timeOfDay,
          }))
          .max(28),
      })
      .optional(),
    attributes: z
      .array(z.object({
        name: z.string().regex(/^attributes\/[a-z0-9_]+$/),
        // null = «sin cargar»: el atributo se borra de la ficha (ni sí ni no).
        value: z.boolean().nullable(),
      }))
      .max(100)
      .optional(),
    links: z
      .array(z.object({
        name: z.string().regex(/^attributes\/url_[a-z0-9_]+$/),
        uri: optionalUrl,
      }))
      .max(20)
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'No hay nada para guardar' });

// Publicaciones. Límites de Google: resumen 1.500 caracteres, título de evento
// 58. EVENT y OFFER necesitan título y fechas; un botón que no sea «Llamar»
// necesita su URL.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const googlePostSchema = z
  .object({
    topicType: z.enum(['STANDARD', 'EVENT', 'OFFER']),
    summary: z.string().trim().min(1).max(1500),
    mediaUrl: httpUrl.optional(),
    callToAction: z
      .object({
        actionType: z.enum(['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL']),
        url: httpUrl.optional(),
      })
      .refine((c) => c.actionType === 'CALL' || c.url, { message: 'El botón necesita un enlace' })
      .optional(),
    event: z
      .object({
        title: z.string().trim().min(1).max(58),
        startDate: isoDate,
        startTime: hhmm.optional(),
        endDate: isoDate,
        endTime: hhmm.optional(),
      })
      .refine((e) => e.endDate >= e.startDate, { message: 'La fecha de fin es anterior a la de inicio' })
      .optional(),
    offer: z
      .object({
        couponCode: z.string().trim().max(58).optional(),
        redeemOnlineUrl: httpUrl.optional(),
        termsConditions: z.string().trim().max(5000).optional(),
      })
      .optional(),
  })
  .refine((p) => p.topicType === 'STANDARD' || p.event, { message: 'Las ofertas y los eventos necesitan título y fechas' });

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
