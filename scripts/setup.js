#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up OncoAssist project...\n');

// Create necessary directories
const directories = [
  'logs',
  'certs',
  'dist'
];

directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Check if .env exists
if (!fs.existsSync('.env')) {
  if (fs.existsSync('env.example')) {
    fs.copyFileSync('env.example', '.env');
    console.log('✅ Created .env file from env.example');
    console.log('⚠️  Please update .env with your actual credentials');
  } else {
    console.log('❌ env.example not found');
  }
} else {
  console.log('✅ .env file already exists');
}

console.log('\n📋 Next steps:');
console.log('1. Update .env file with your credentials');
console.log('2. Set up TiDB Serverless cluster');
console.log('3. Configure Google OAuth2 credentials');
console.log('4. Get OpenAI API key');
console.log('5. Set up Twilio account');
console.log('6. Run: npm run build');
console.log('7. Run: npm start');

console.log('\n📚 For detailed setup instructions, see README.md');
console.log('\n✨ Setup complete!');
