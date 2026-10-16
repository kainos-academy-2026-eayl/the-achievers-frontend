import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';

export function createApp(): Express {
  const app = express();

  nunjucks.configure('views', {
    autoescape: true,
    express: app,
  });
  app.set('view engine', 'njk');

  app.get('/', (_req: Request, res: Response) => {
    res.render('home', { title: 'Achievers' });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  return app;
}
