const fs = require('fs');

function auditFile(file) {
  console.log(`\n=================== AUDIT: ${file} ===================`);
  const html = fs.readFileSync(file, 'utf8');

  // Stripe links
  const stripe = [...new Set(html.match(/https:\/\/buy\.stripe\.com\/[a-zA-Z0-9]+/g) || [])];
  console.log('Stripe links:', stripe);

  // Checkouts & API
  const checkoutLinks = html.match(/href=["'](\/api\/create-[^"']+)["']/g) || [];
  console.log('Checkout API links:', [...new Set(checkoutLinks)]);

  // Key CTA Buttons
  const btns = html.match(/<button[^>]*onclick=["']([^"']+)["'][^>]*>([\s\S]*?)<\/button>/gi) || [];
  btns.forEach(b => {
    const oc = b.match(/onclick=["']([^"']+)["']/i)[1];
    const txt = b.replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
    if (oc.includes('Checkout') || oc.includes('Stripe') || oc.includes('Modal') || oc.includes('Trial') || oc.includes('Voice')) {
      console.log(`[CTA Btn] "${txt}" -> ${oc}`);
    }
  });
}

auditFile('index.html');
auditFile('sales_landing_page.html');
auditFile('voice.html');
auditFile('agency.html');
