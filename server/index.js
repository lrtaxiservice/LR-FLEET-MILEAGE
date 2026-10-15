import 'dotenv/config';
import { createApp } from './app.js';

process.env.TZ ||= 'Asia/Kolkata';
const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => console.log(`LR Fleet App running on http://localhost:${port}`));
