import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import * as dotenv from 'dotenv';
import { createCanvas, loadImage, registerFont } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Load environment variables
dotenv.config();

// Check if BOT_TOKEN is defined
if (!process.env.BOT_TOKEN) {
  console.error('BOT_TOKEN is not defined in .env file');
  process.exit(1);
}

// Initialize the bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Custom interface for bot context
interface TradingCardContext extends Context {
  session?: {
    step: 'ticker' | 'initialInvestment' | 'finalAmount' | 'chainChoice' | 'complete';
    ticker?: string;
    initialInvestment?: number;
    finalAmount?: number;
    solPrice?: number;
    ethPrice?: number;
    chain?: 'SOL' | 'ETH';
  };
}
// simple session middleware
const sessions = new Map<number, TradingCardContext['session']>();

// Middleware to handle sessions
bot.use((ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  if (!sessions.has(userId)) {
    sessions.set(userId, { step: 'ticker' });
  }
  
  (ctx as TradingCardContext).session = sessions.get(userId);
  return next();
});

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

// Start command - acts the same as gen_card
bot.start((ctx) => {
  const userId = ctx.from?.id;
  if (userId) {
    sessions.set(userId, { step: 'ticker' });
    ctx.reply('Welcome to the Trading Card Generator! 🚀\n\nPlease enter the ticker symbol for your trade (e.g., $TRUMP, $BONK):');
  }
});

// Generate card command
bot.command('gen_card', (ctx) => {
  const userId = ctx.from?.id;
  if (userId) {
    sessions.set(userId, { step: 'ticker' });
    ctx.reply('Welcome to the Trading Card Generator! 🚀\n\nPlease enter the ticker symbol for your trade (e.g., $TRUMP, $BONK):');
  }
});

// Help command
bot.help((ctx) => {
  ctx.reply(
    'This bot creates a stylized trading card with your trade details. 📈\n\n' +
    'Commands:\n' +
    '/gen_card - Start creating a new card 🖼️\n' +
    '/cancel - Cancel the current operation ❌\n' +
    '/help - Show this help message 💡'
  );
});

// Cancel command
bot.command('cancel', (ctx) => {
  const userId = ctx.from?.id;
  if (userId) {
    sessions.set(userId, { step: 'ticker' });
    ctx.reply('Operation cancelled ❌. Send /gen_card to create a new card.');
  }
});

// Handle text messages
bot.on(message('text'), async (ctx) => {
  const typedContext = ctx as TradingCardContext;
  const userId = ctx.from?.id;
  const text = ctx.message.text;
  
  if (!userId || !typedContext.session) return;
  
  const session = typedContext.session;
  
  switch (session.step) {
    case 'ticker':
      // Validate ticker
      const ticker = text.trim().toUpperCase();
      if (!ticker || ticker.length > 10) {
        return ctx.reply('Please enter a valid ticker 🔗 symbol (1-10 characters):');
      }
      
      session.ticker = ticker;
      session.step = 'initialInvestment';
      ctx.reply('Now enter your initial investment amount 💸:');
      break;
      
    case 'initialInvestment':
      const initialInvestment = parseFloat(text);
      if (isNaN(initialInvestment) || initialInvestment <= 0) {
        return ctx.reply('Please enter a valid positive number for your initial investment:');
      }
      
      session.initialInvestment = initialInvestment;
      session.step = 'finalAmount';
      ctx.reply('Now enter the final amount after selling 🏷️:');
      break;
      
    case 'finalAmount':
      const finalAmount = parseFloat(text);
      if (isNaN(finalAmount) || finalAmount < 0) {
        return ctx.reply('Please enter a valid non-negative number for your final amount:');
      }
      
      session.finalAmount = finalAmount;
      session.step = 'chainChoice';
      
      // Ask user to choose between SOL and ETH
      ctx.reply('Which blockchain would you like to use for the card? Reply with SOL or ETH:', {
        reply_markup: {
          keyboard: [
            [{ text: 'SOL' }, { text: 'ETH' }]
          ],
          one_time_keyboard: true,
          resize_keyboard: true
        }
      });
      break;
      
    case 'chainChoice':
      const chain = text.trim().toUpperCase();
      if (chain !== 'SOL' && chain !== 'ETH') {
        return ctx.reply('Please choose either SOL or ETH:');
      }
      
      session.chain = chain as 'SOL' | 'ETH';
      session.step = 'complete';
      
      // Generate and send the card
      await ctx.reply(`Fetching current ${chain} price and generating your trading card...`);
      
      try {
        let price: number;
        
        // Get current price based on selected chain
        if (session.chain === 'SOL') {
          price = await getSolanaPrice();
          session.solPrice = price;
        } else { // ETH
          price = await getEthereumPrice();
          session.ethPrice = price;
        }
        
        // Generate card with price information
        const cardBuffer = await generateTradingCard(
          session.ticker!,
          session.initialInvestment!,
          session.finalAmount!,
          price,
          session.chain
        );
        
        await ctx.replyWithPhoto({ source: cardBuffer });
        
        // Send price information message
        await ctx.reply(`Current ${session.chain} price: $${price.toFixed(2)} USD\n` +
                        `Initial investment value: $${(session.initialInvestment! * price).toFixed(2)}\n` +
                        `Current value: $${(session.finalAmount! * price).toFixed(2)}`);
        
        // Reset session for new card
        session.step = 'ticker';
        ctx.reply('Card generated successfully! Send /gen_card to create another card.');
      } catch (error) {
        console.error('Error generating card:', error);
        ctx.reply('Sorry, there was an error generating your card. Please try again with /gen_card');
        session.step = 'ticker';
      }
      break;
      
    default:
      ctx.reply('Send /gen_card to create a new trading card.');
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

// Launch the bot
bot.launch().then(() => {
  console.log('Bot is running!');
  
  // Set bot command menu to show gen_card first
  bot.telegram.setMyCommands([
    { command: 'gen_card', description: 'Generate a trading card 🖼️' },
    { command: 'help', description: 'Show help information 💡' },
    { command: 'cancel', description: 'Cancel current operation ❌' }
  ]).then(() => {
    console.log('Command menu updated successfully');
  }).catch(err => {
    console.error('Failed to update command menu:', err);
  });
}).catch(err => {
  console.error('Failed to start bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));