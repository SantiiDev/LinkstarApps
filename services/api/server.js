import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PORT, FRONTEND_URLS } from './lib/config.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import redirectRoutes from './routes/redirect.js';
import ordersRoutes from './routes/orders.js';
import contactRoutes from './routes/contact.js';
import subscriptionRoutes from './routes/subscriptions.js';
import webhookRoutes from './routes/webhooks.js';

const app = express();

// Railway/Render ponen un proxy adelante. Sin esto req.ip es la IP del proxy,
// así que el rate limit de /d/:publicId sería un único balde compartido por
// todo el mundo (y express-rate-limit v8 además protesta si ve un
// X-Forwarded-For sin trust proxy configurado). Va `1` y no `true`: confiar en
// toda la cadena deja que cualquiera falsee su IP mandando el header a mano.
app.set('trust proxy', 1);

// Este backend no está detrás de Cloudflare, así que las protecciones de nivel
// request (headers de seguridad, rate limit) se hacen acá y no en el borde.
app.use(helmet());
app.use(cors({ origin: FRONTEND_URLS }));
app.use(express.json());

app.use(healthRoutes);
app.use(authRoutes);
app.use(redirectRoutes);
app.use(ordersRoutes);
app.use(contactRoutes);
app.use(subscriptionRoutes);
app.use(webhookRoutes);

app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════╗
  ║   🚀  Linkstar Backend running            ║
  ║   📍  http://localhost:${PORT}              ║
  ║   🔗  Frontend: ${FRONTEND_URLS.join(', ')}    ║
  ╚════════════════════════════════════════════╝
  `);
});
