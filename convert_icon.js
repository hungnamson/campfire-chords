import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgPath = path.join(__dirname, 'frontend', 'public', 'favicon.svg');
const png192Path = path.join(__dirname, 'frontend', 'public', 'apple-touch-icon.png');
const png512Path = path.join(__dirname, 'frontend', 'public', 'icon-512.png');

async function convert() {
  const svgBuffer = fs.readFileSync(svgPath);
  
  // Render 192x192 PNG for apple-touch-icon
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(png192Path);
    
  // Render 512x512 PNG for Android manifest / larger clip
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(png512Path);

  console.log("Success! Rendered apple-touch-icon.png and icon-512.png");
}

convert().catch(console.error);
