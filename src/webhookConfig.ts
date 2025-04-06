import { Telegraf } from 'telegraf';
import express from 'express';
import bodyParser from 'body-parser';

export const setupWebhook = async (bot: Telegraf) => {
  // To jest dla użycia z Render.com
  const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
  const PORT: number = parseInt(process.env.PORT || '10000', 10);
  
  console.log("Starting server with environment:", {
    PORT: process.env.PORT,
    RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL,
  });
  
  if (RENDER_EXTERNAL_URL) {
    // Jesteśmy na Render, skonfiguruj webhook
    const webhookUrl = `${RENDER_EXTERNAL_URL}/bot${process.env.BOT_TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`Webhook set to ${webhookUrl}`);
    
    // Uruchom serwer Express, aby obsługiwać żądania webhook
    const app = express();
    app.use(bodyParser.json());
    
    // Ustaw endpoint API bota
    app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
      bot.handleUpdate(req.body, res);
    });
    
    // Dodaj endpoint sprawdzający działanie
    app.get('/', (req, res) => {
      res.send('Bot is running!');
    });
    
    // Uruchom serwer - ważne jest bindowanie do 0.0.0.0 dla Render
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
      });
    
    return true; // Webhook skonfigurowany
  }
  
  return false; // Używamy pollingu
};