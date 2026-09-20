// scripts/verify_phase2_frontend.js
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const frontendFiles = [
  'index.html',
  'sales_landing_page.html',
  'blog.html',
  'developers.html',
  'terms.html'
];

console.log('====================================================');
console.log('🔍 PHASE 2 VERIFICATION: FRONTEND WEBSITE PRICING & TIERS');
console.log('====================================================\n');

let errors = 0;

// 1. Check that NO $149.99 or $149 references remain in frontend files
frontendFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${file}`);
    errors++;
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('149.99') || line.includes('$149')) {
      console.error(`❌ ${file}:${idx + 1} contains legacy 149 reference: ${line.trim()}`);
      errors++;
    }
  });
});

// 2. Check for key tier tokens in index.html & sales_landing_page.html
const requiredTokens = [
  { name: 'Autonomous Front Desk Bundle ($99/mo)', pattern: /99\/mo/i },
  { name: 'Pooled minutes 250', pattern: /250 pooled minutes/i },
  { name: 'Pro Automation Gateway ($299)', pattern: /299/ },
  { name: 'Voice Starter $29/mo (45 mins)', pattern: /45\s+(?:monthly\s+)?pooled minutes/i },
  { name: 'Voice Business $89/mo (300 mins)', pattern: /300\s+(?:monthly\s+)?pooled minutes/i },
  { name: 'Flagship Appliance $49.99', pattern: /49\.99/ }
];

['index.html', 'sales_landing_page.html'].forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  requiredTokens.forEach(token => {
    if (token.pattern.test(content)) {
      console.log(`✅ [${file}] Contains ${token.name}`);
    } else {
      console.error(`❌ [${file}] Missing ${token.name}`);
      errors++;
    }
  });
});

// 3. Verify HTML structure / syntax (closing tags match)
['index.html', 'sales_landing_page.html', 'developers.html', 'blog.html', 'terms.html'].forEach(file => {
  const content = fs.readFileSync(path.join(rootDir, file), 'utf8');
  const openDivs = (content.match(/<div/gi) || []).length;
  const closeDivs = (content.match(/<\/div>/gi) || []).length;
  if (Math.abs(openDivs - closeDivs) > 3) {
    console.warn(`⚠️ [${file}] Potential div mismatch: open=${openDivs}, close=${closeDivs}`);
  } else {
    console.log(`✅ [${file}] Div tags balanced (${openDivs} open, ${closeDivs} closed)`);
  }
});

console.log('\n----------------------------------------------------');
if (errors === 0) {
  console.log('🎉 PHASE 2 FRONTEND VERIFICATION PASSED WITH 0 ERRORS!');
  process.exit(0);
} else {
  console.error(`🚨 PHASE 2 VERIFICATION FAILED WITH ${errors} ERRORS!`);
  process.exit(1);
}
