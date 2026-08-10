import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PORT, FRONTEND_URL } from './lib/config.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import redirectRoutes from './routes/redirect.js';
import ordersRoutes from './routes/orders.js';
import webhookRoutes from './routes/webhooks.js';

const app = express();

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

app.use(healthRoutes);
app.use(authRoutes);
app.use(redirectRoutes);
app.use(ordersRoutes);
app.use(webhookRoutes);

app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════╗
  ║   🚀  Linkstar Backend running            ║
  ║   📍  http://localhost:${PORT}              ║
  ║   🔗  Frontend: ${FRONTEND_URL}    ║
  ╚════════════════════════════════════════════╝
  `);
});
