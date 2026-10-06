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
import teamRoutes from './routes/team.js';
import googleRoutes from './routes/google.js';

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
// credentials: true por la conexión con Google (routes/google.js): el inicio
// del flujo setea una cookie con el state anti-CSRF desde un fetch del panel,
// y sin esto el navegador la descarta. Sólo aplica a los orígenes de la lista.
app.use(cors({ origin: FRONTEND_URLS, credentials: true }));
app.use(express.json());

app.use(healthRoutes);
app.use(authRoutes);
app.use(redirectRoutes);
app.use(ordersRoutes);
app.use(contactRoutes);
app.use(subscriptionRoutes);
app.use(teamRoutes);
app.use(googleRoutes);
app.use(webhookRoutes);

// Sin host en el mensaje: en Railway "localhost" sólo confunde al leer los logs.
app.listen(PORT, () => {
  console.log(`🚀 Linkstar API escuchando en el puerto ${PORT}`);
  console.log(`🔗 CORS: ${FRONTEND_URLS.join(', ')}`);
});
