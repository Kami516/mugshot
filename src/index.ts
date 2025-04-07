import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import * as dotenv from 'dotenv';
import { createCanvas, loadImage, registerFont } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { setupWebhook } from './webhookConfig';

// Load environment variables
dotenv.config();

// Check if BOT_TOKEN is defined
if (!process.env.BOT_TOKEN) {
  console.error('BOT_TOKEN is not defined in .env file');
  process.exit(1);
}

// Initialize the bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Register fonts
try {
  // Attempt to register fonts if available
  registerFont(path.join(__dirname, 'fonts', 'Impact.ttf'), { family: 'Impact' });
  registerFont(path.join(__dirname, 'fonts', 'Arial-Bold.ttf'), { family: 'Arial-Bold' });
  registerFont(path.join(__dirname, 'fonts', 'AntonSC.ttf'), { family: 'AntonSC' });
  registerFont(path.join(__dirname, 'fonts', 'GeistMono.ttf'), { family: 'GeistMono' });
} catch (error) {
  console.warn('Font registration failed:', error);
  console.warn('Using system default fonts instead');
}

// Function to fetch current SOL price
async function getSolanaPrice(): Promise<number> {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    return response.data.solana.usd;
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    // Return a default price if API call fails
    return 150; // Fallback price
  }
}

// Function to fetch current ETH price
async function getEthereumPrice(): Promise<number> {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    return response.data.ethereum.usd;
  } catch (error) {
    console.error('Error fetching ETH price:', error);
    // Return a default price if API call fails
    return 3500; // Fallback price
  }
}

// Start command - shows usage information
bot.start((ctx) => {
  ctx.reply(
    'Welcome to the Trading Card Generator! 🚀\n\n' +
    'Use the /gen_card command with the following format:\n' +
    '/gen_card TICKER INITIAL_INVESTMENT FINAL_AMOUNT CURRENCY\n\n' +
    'Example: /gen_card BONK 1000 2500 SOL\n\n' +
    'CURRENCY can be either SOL or ETH.'
  );
});

// Help command
bot.help((ctx) => {
  ctx.reply(
    'This bot creates a stylized trading card with your trade details. 📈\n\n' +
    'Commands:\n' +
    '/gen_card TICKER INITIAL_INVESTMENT FINAL_AMOUNT CURRENCY - Generate a card with your trading details 🖼️\n' +
    '  Example: /gen_card BONK 1000 2500 SOL\n\n' +
    '/help - Show this help message 💡'
  );
});

// Single command to generate card
bot.command('gen_card', async (ctx) => {
  const text = ctx.message.text.trim();
  const parts = text.split(' ').filter(part => part.trim() !== '');
  
  // Check if we have enough parameters
  if (parts.length < 5) {
    return ctx.reply(
      'Please provide all required parameters:\n' +
      '/gen_card TICKER INITIAL_INVESTMENT FINAL_AMOUNT CURRENCY\n\n' +
      'Example: /gen_card BONK 1000 2500 SOL'
    );
  }
  
  // Extract parameters
  const [_, ticker, initialInvestmentStr, finalAmountStr, chainStr] = parts;
  
  // Validate ticker
  if (!ticker || ticker.length > 10) {
    return ctx.reply('Please enter a valid ticker symbol (1-10 characters)');
  }
  
  // Validate initial investment
  const initialInvestment = parseFloat(initialInvestmentStr);
  if (isNaN(initialInvestment) || initialInvestment <= 0) {
    return ctx.reply('Please enter a valid positive number for your initial investment');
  }
  
  // Validate final amount
  const finalAmount = parseFloat(finalAmountStr);
  if (isNaN(finalAmount) || finalAmount < 0) {
    return ctx.reply('Please enter a valid non-negative number for your final amount');
  }
  
  // Validate chain
  const chain = chainStr.trim().toUpperCase();
  if (chain !== 'SOL' && chain !== 'ETH') {
    return ctx.reply('Please choose either SOL or ETH for the currency');
  }
  
  // Generate and send the card
  await ctx.reply(`Fetching current ${chain} price and generating your trading card...`);
  
  try {
    let price: number;
    
    // Get current price based on selected chain
    if (chain === 'SOL') {
      price = await getSolanaPrice();
    } else { // ETH
      price = await getEthereumPrice();
    }
    
    // Generate card with price information
    const cardBuffer = await generateTradingCard(
      ticker.toUpperCase(),
      initialInvestment,
      finalAmount,
      price,
      chain as 'SOL' | 'ETH'
    );
    
    await ctx.replyWithPhoto({ source: cardBuffer });
    
    // Send price information message
    await ctx.reply(`Current ${chain} price: $${price.toFixed(2)} USD\n` +
                   `Initial investment value: $${(initialInvestment * price).toFixed(2)}\n` +
                   `Current value: $${(finalAmount * price).toFixed(2)}`);
  } catch (error) {
    console.error('Error generating card:', error);
    ctx.reply('Sorry, there was an error generating your card. Please try again.');
  }
});

// Function to generate the trading card
async function generateTradingCard(
  ticker: string, 
  initialInvestment: number, 
  finalAmount: number, 
  tokenPrice: number = 150,
  chain: 'SOL' | 'ETH' = 'SOL'
): Promise<Buffer> {
  // Create canvas with dimensions matching the bg.png size
  const canvasWidth = 1600;
  const canvasHeight = 1071;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  
  // Calculate profit/loss
  const profit = finalAmount - initialInvestment;
  const profitPercentage = (profit / initialInvestment);
  const isProfitable = profit >= 0;
  const roi = finalAmount / initialInvestment;
  
  // Calculate dollar values
  const initialUsd = initialInvestment * tokenPrice;
  const finalUsd = finalAmount * tokenPrice;
  const profitUsd = finalUsd - initialUsd;
  
  // Add the background image
  try {
    const bgImagePath = path.join(process.cwd(), 'src', 'images', 'bg.png');
    console.log("Looking for background image at:", bgImagePath);
    if (fs.existsSync(bgImagePath)) {
      const bgImage = await loadImage(bgImagePath);
      
      // Draw the background image
      ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
    } else {
      console.error("Background image not found at path:", bgImagePath);
      // Fallback to black background if image fails
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
  } catch (error) {
    console.error('Error loading background image:', error);
    // Fallback to black background if image fails
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  
  // Add "MUGSHOT" text box in bottom right
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 5;
  // Position based on the measurements in the image
  ctx.strokeRect(1192, 848, 321, 125); 
  ctx.fillStyle = '#000000';
  ctx.fillRect(1194, 850, 317, 121); 
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 70px Impact';
  ctx.textAlign = 'center';
  ctx.fillText('MUGSHOT', 1352, 937);
    
  // Draw ticker 
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 132px AntonSC';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`$${ticker}`, 112, 63);
  
  // Draw PROFIT/LOSS header 
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '36px GeistMono';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('PROFIT/LOSS', 125, 299);
  
  // Draw profit amount in USD 
  ctx.fillStyle = isProfitable ? '#00FF00' : '#FF0000';
  ctx.font = 'bold 152px Impact';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${isProfitable ? '+$' : '-$'}${Math.abs(profitUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 61, 346);
  
  // Draw percentage 
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 74px Impact';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Tekst procentu
  const percentageText = `${profit.toFixed(3)}`;
  ctx.fillText(percentageText, 119, 577);

  const percentageTextWidth = ctx.measureText(percentageText).width;
  const fontSize = 74;
  const textHeight = fontSize * 0.75;

  // sol/eth logo
  const tokenLogoX = 119 + percentageTextWidth + 20;
  const tokenLogoY = 577 - (textHeight / 2);
  // Load the logo for the selected chain (SOL or ETH)
  try {
    const tokenLogoPath = path.join(process.cwd(), 'src', 'images', `${chain.toLowerCase()}.png`);
    if (fs.existsSync(tokenLogoPath)) {
      const tokenLogo = await loadImage(tokenLogoPath);
      if (chain === 'ETH') {
        const ethLogoWidth = 39;
        const aspectRatio = tokenLogo.height / tokenLogo.width;
        const ethLogoHeight = ethLogoWidth * aspectRatio;
        ctx.drawImage(tokenLogo, tokenLogoX, tokenLogoY, ethLogoWidth, ethLogoHeight);
      } else {
        ctx.drawImage(tokenLogo, tokenLogoX, tokenLogoY, textHeight, textHeight);
      }
    }
  } catch (error) {
    console.error(`Error loading ${chain} logo:`, error);
  }
  
  // Create investment box with blue border
  ctx.strokeStyle = '#818181'; // Light gray/blue border
  ctx.lineWidth = 5;
  ctx.strokeRect(70, 736, 671, 261); 
  
  // Fill with dark background color
  ctx.fillStyle = '#202020'; // Very dark gray, nearly black
  ctx.fillRect(73, 738, 665, 257);

  // bottom box
  ctx.strokeStyle = '#919191'; // Light gray/blue border
  ctx.lineWidth = 5;
  ctx.strokeRect(70, 998, 671, 12); // Scaled up from original
  // Fill with dark background color
  ctx.fillStyle = '#919191'; // Very dark gray, nearly black
  ctx.fillRect(70, 998, 671, 12);
  
  // Draw investment details
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '28px GeistMono';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('INVESTED', 130, 780);

  const soldText = `SOLD ${roi.toFixed(2)}`;
  ctx.fillText(soldText, 440, 780);

  const soldTextWidth = ctx.measureText(soldText).width;

  ctx.font = 'bold 28px GeistMono';
  ctx.fillText("X ROI", 440 + soldTextWidth, 780);

  // back to normal font
  ctx.font = 'bold 77px Impact';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // load token logo
  try {
    const tokenLogoPath = path.join(process.cwd(), 'src', 'images', `${chain.toLowerCase()}.png`);
    if (fs.existsSync(tokenLogoPath)) {
      const tokenLogo = await loadImage(tokenLogoPath);
      
      // Tekst zainwestowanej kwoty
      const investmentText = `${initialInvestment.toFixed(1)}`;
      ctx.fillText(investmentText, 130, 835);
      
      // szerokość tekstu kwoty zainwestowanej
      const investmentTextWidth = ctx.measureText(investmentText).width;
      
      //wysokość czcionki
      const fontSize = 77;
      const textHeight = fontSize * 0.75;
      
      // Pozycja pierwszego logo (SOL lub ETH)
      const tokenLogoX = 130 + investmentTextWidth + 19;
      const tokenLogoY = 835 + (textHeight * 0.35);
      
      // pierwsze logo 
      if (chain === 'ETH') {
        const ethLogoWidth = 39;
        const aspectRatio = tokenLogo.height / tokenLogo.width;
        const ethLogoHeight = ethLogoWidth * aspectRatio;
        ctx.drawImage(tokenLogo, tokenLogoX, tokenLogoY, ethLogoWidth, ethLogoHeight);
      } else {
        ctx.drawImage(tokenLogo, tokenLogoX, tokenLogoY, textHeight, textHeight);
      }
      
      // stroke.png
      try {
        const strokePath = path.join(process.cwd(), 'src', 'images', 'stroke.png');
        if (fs.existsSync(strokePath)) {
          const strokeImage = await loadImage(strokePath);
          
          // stroke.png position
          const availableSpace = 440 - (tokenLogoX + textHeight);
          const strokeX = tokenLogoX + textHeight + (availableSpace / 2) - (22 / 2); 
          const strokeY = 850 + (textHeight / 2) - (35 / 2); 
          
          ctx.drawImage(strokeImage, strokeX, strokeY, 22, 35);
          
          // finalAmount color
          ctx.fillStyle = isProfitable ? '#00FF00' : '#FF0000';
          
          // finalAmount
          const finalAmountText = `${finalAmount.toFixed(1)}`;
          ctx.fillText(finalAmountText, 440, 835);
          
          const finalAmountWidth = ctx.measureText(finalAmountText).width;
          
          // Pozycja drugiego logo
          const finalTokenX = 440 + finalAmountWidth + 19;
          
          //  drugie logo 
          if (chain === 'ETH') {
            const ethLogoWidth = 39;
            const aspectRatio = tokenLogo.height / tokenLogo.width;
            const ethLogoHeight = ethLogoWidth * aspectRatio;
            ctx.drawImage(tokenLogo, finalTokenX, tokenLogoY, ethLogoWidth, ethLogoHeight);
          } else {
            ctx.drawImage(tokenLogo, finalTokenX, tokenLogoY, textHeight, textHeight);
          }
        } else {
          // Fallback dla stroke.png
          ctx.fillText('>', 352, 835);
          
          //  kolor dla finalAmount
          ctx.fillStyle = isProfitable ? '#00FF00' : '#FF0000';
          
          //  finalAmount
          const finalAmountText = `${finalAmount.toFixed(1)}`;
          ctx.fillText(finalAmountText, 440, 835);
          
          // szerokość finalAmount
          const finalAmountWidth = ctx.measureText(finalAmountText).width;
          
          // Pozycja drugiego logo
          const finalTokenX = 440 + finalAmountWidth + 19;
          
          // drugie logo
          if (chain === 'ETH') {
            const ethLogoWidth = 39;
            const aspectRatio = tokenLogo.height / tokenLogo.width;
            const ethLogoHeight = ethLogoWidth * aspectRatio;
            ctx.drawImage(tokenLogo, finalTokenX, tokenLogoY, ethLogoWidth, ethLogoHeight);
          } else {
            ctx.drawImage(tokenLogo, finalTokenX, tokenLogoY, textHeight, textHeight);
          }
        }
      } catch (error) {
        // Fallback dla stroke.png
        ctx.fillText('>', 352, 835);
        
        // kolor dla finalAmount
        ctx.fillStyle = isProfitable ? '#00FF00' : '#FF0000';
        
        // finalAmount
        const finalAmountText = `${finalAmount.toFixed(1)}`;
        ctx.fillText(finalAmountText, 440, 835);
        
        // szerokość finalAmount
        const finalAmountWidth = ctx.measureText(finalAmountText).width;
        
        // Pozycja drugiego logo
        const finalTokenX = 448 + finalAmountWidth + 19;
        
        // drugie logo 
        if (chain === 'ETH') {
          const ethLogoWidth = 39;
          const aspectRatio = tokenLogo.height / tokenLogo.width;
          const ethLogoHeight = ethLogoWidth * aspectRatio;
          ctx.drawImage(tokenLogo, finalTokenX, tokenLogoY, ethLogoWidth, ethLogoHeight);
        } else {
          ctx.drawImage(tokenLogo, finalTokenX, tokenLogoY, textHeight, textHeight);
        }
      }
    } else {
      // Fallback jeśli nie znaleziono logo
      ctx.fillText('≡', 272, 835);
      ctx.fillText('>', 352, 835);
      
      // Ustaw kolor dla finalAmount
      ctx.fillStyle = isProfitable ? '#00FF00' : '#FF0000';
      
      // finalAmount
      const finalAmountText = `${finalAmount.toFixed(1)}`;
      ctx.fillText(finalAmountText, 440, 835);
      
      // Fallback dla drugiego logo
      ctx.fillText('≡', 544, 835);
    }
  } catch (error) {
    // Kompletny fallback
    ctx.fillText('≡', 272, 835);
    ctx.fillText('>', 352, 835);
    
    // Ustaw kolor dla finalAmount
    ctx.fillStyle = isProfitable ? '#00FF00' : '#FF0000';
    
    //finalAmount
    const finalAmountText = `${finalAmount.toFixed(1)}`;
    ctx.fillText(finalAmountText, 440, 835);
    
    // Fallback dla drugiego logo
    ctx.fillText('≡', 544, 835);
  }

  // Draw dollar amounts in smaller text
  ctx.font = 'bold 26px GeistMono';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#818181';
  ctx.fillText(`$${initialUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 130, 927);

  ctx.fillStyle = '#818181';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`$${finalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 440, 927);
    
  // Return buffer
  return canvas.toBuffer();
}

// Start the bot
const startBot = async () => {
  // Check if we need to set up webhooks
  const isWebhook = await setupWebhook(bot);
  
  // If not using webhook (local development), launch with polling
  if (!isWebhook) {
    bot.launch().then(() => {
      console.log('Bot is running in polling mode!');
      
      // Set bot command menu
      bot.telegram.setMyCommands([
        { command: 'gen_card', description: 'Generate a trading card: /gen_card TICKER INITIAL FINAL CURRENCY' },
        { command: 'help', description: 'Show help information 💡' }
      ]).catch(err => {
        console.error('Failed to update command menu:', err);
      });
    }).catch(err => {
      console.error('Failed to start bot:', err);
    });
  }
};

startBot();