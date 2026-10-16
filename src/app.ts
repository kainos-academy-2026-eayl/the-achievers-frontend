import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';

export function createApp(): Express {
  const app = express();

  app.use(express.static('public'));

  nunjucks.configure('views', {
    autoescape: true,
    express: app,
    // tsx watch only restarts on .ts changes, so templates must not be cached in dev.
    noCache: process.env.NODE_ENV !== 'production',
  });
  app.set('view engine', 'njk');

  app.get('/', (_req: Request, res: Response) => {
    res.render('home-page', { title: 'Cue Corner | Pool & Snooker Equipment' });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  return app;
}
