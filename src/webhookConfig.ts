import { Telegraf } from 'telegraf';
import express from 'express';
import bodyParser from 'body-parser';

export const setupWebhook = async (bot: Telegraf) => {
  // This is for use with Render.com
  const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
  // Convert PORT to a number
  const PORT = parseInt(process.env.PORT || '10000', 10);
  
  console.log("Starting server with environment:", {
    PORT: process.env.PORT,
    RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL,
  });
  
  if (RENDER_EXTERNAL_URL) {
    // We're on Render, set up webhook
    const webhookUrl = `${RENDER_EXTERNAL_URL}/bot${process.env.BOT_TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`Webhook set to ${webhookUrl}`);
    
    // Start Express server to handle webhook requests
    const app = express();
    app.use(bodyParser.json());
    
    // Set the bot API endpoint
    app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
      bot.handleUpdate(req.body, res);
    });
    
    // Set up a health check endpoint
    app.get('/', (req, res) => {
      res.send('Bot is running!');
    });
    
    // Start server - explicitly bind to 0.0.0.0 for Render
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
    
    return true; // Webhook set up
  }
  
  return false; // Using polling
};