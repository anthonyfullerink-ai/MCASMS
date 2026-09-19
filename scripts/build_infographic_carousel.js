const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.join(__dirname, '../assets/ads/infographics');
fs.mkdirSync(outDir, { recursive: true });

// Slide 1: The 5-Minute Drop-Off Curve (Cover Hook)
const slide1Html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    height: 1350px;
    background: #080B10;
    color: #F0F6FC;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 70px 60px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }
  /* Subtle background ambient glow */
  body::before {
    content: '';
    position: absolute;
    top: -100px;
    right: -100px;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, rgba(0, 230, 118, 0.12) 0%, transparent 70%);
    pointer-events: none;
  }
  body::after {
    content: '';
    position: absolute;
    bottom: -150px;
    left: -150px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(0, 180, 216, 0.08) 0%, transparent 70%);
    pointer-events: none;
  }

  /* Header Badge */
  .badge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 230, 118, 0.12);
    border: 1px solid rgba(0, 230, 118, 0.35);
    color: #00E676;
    padding: 10px 20px;
    border-radius: 999px;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .slide-count {
    font-size: 20px;
    color: #8B949E;
    font-weight: 600;
  }

  /* Title Section */
  .title-section {
    margin-top: 30px;
  }
  h1 {
    font-size: 58px;
    line-height: 1.15;
    font-weight: 900;
    letter-spacing: -1px;
    color: #FFFFFF;
  }
  h1 span.highlight {
    background: linear-gradient(90deg, #00E676 0%, #00B4D8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  p.subtitle {
    font-size: 26px;
    color: #8B949E;
    margin-top: 14px;
    line-height: 1.4;
  }

  /* Data Chart Cards */
  .chart-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin: 30px 0;
  }
  .stat-card {
    background: #0F141C;
    border: 1px solid #1F2937;
    border-radius: 20px;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
  }
  .stat-card.winner {
    border-color: rgba(0, 230, 118, 0.5);
    box-shadow: 0 8px 30px rgba(0, 230, 118, 0.08);
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .time-label {
    font-size: 24px;
    font-weight: 700;
    color: #FFFFFF;
  }
  .percent-tag {
    font-size: 32px;
    font-weight: 900;
  }
  .percent-tag.green { color: #00E676; }
  .percent-tag.amber { color: #FFB300; }
  .percent-tag.red { color: #FF5252; }

  .bar-bg {
    width: 100%;
    height: 16px;
    background: #1C2333;
    border-radius: 999px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 999px;
  }
  .bar-green { width: 82%; background: linear-gradient(90deg, #00E676, #00B4D8); }
  .bar-amber { width: 31%; background: #FFB300; }
  .bar-red { width: 7%; background: #FF5252; }
  .card-sub {
    font-size: 19px;
    color: #8B949E;
    font-weight: 500;
  }

  /* Multi-Trade Reality Box */
  .trades-box {
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed #30363D;
    border-radius: 18px;
    padding: 22px 26px;
  }
  .trades-title {
    font-size: 20px;
    color: #C9D1D9;
    font-weight: 700;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .trade-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .chip {
    background: #161B22;
    border: 1px solid #30363D;
    padding: 8px 16px;
    border-radius: 10px;
    font-size: 18px;
    color: #E6EDF3;
    font-weight: 600;
  }

  /* Bottom Takeaway */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #21262D;
    padding-top: 24px;
  }
  .footer-brand {
    font-size: 22px;
    font-weight: 800;
    color: #FFFFFF;
    letter-spacing: -0.5px;
  }
  .footer-brand span {
    color: #00E676;
  }
  .swipe-prompt {
    font-size: 20px;
    color: #8B949E;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
</head>
<body>
  <div>
    <div class="badge-row">
      <div class="badge">📊 Lead Response Benchmark</div>
      <div class="slide-count">01 / 03</div>
    </div>

    <div class="title-section">
      <h1>THE <span class="highlight">5-MINUTE</span><br>DROP-OFF CURVE</h1>
      <p class="subtitle">What happens to caller intent when your hands are full and the phone rings to voicemail.</p>
    </div>

    <div class="chart-container">
      <div class="stat-card winner">
        <div class="card-top">
          <div class="time-label">⚡ 0 to 5 Minutes (Instant Text)</div>
          <div class="percent-tag green">82%</div>
        </div>
        <div class="bar-bg"><div class="bar-fill bar-green"></div></div>
        <div class="card-sub">High close rate. Client stops searching competitors immediately.</div>
      </div>

      <div class="stat-card">
        <div class="card-top">
          <div class="time-label">⏳ 5 to 30 Minutes</div>
          <div class="percent-tag amber">31%</div>
        </div>
        <div class="bar-bg"><div class="bar-fill bar-amber"></div></div>
        <div class="card-sub">50%+ of callers have already contacted a competitor.</div>
      </div>

      <div class="stat-card">
        <div class="card-top">
          <div class="time-label">❌ 30+ Minutes Later</div>
          <div class="percent-tag red">7%</div>
        </div>
        <div class="bar-bg"><div class="bar-fill bar-red"></div></div>
        <div class="card-sub">"Thanks, we already booked someone else."</div>
      </div>
    </div>

    <div class="trades-box">
      <div class="trades-title">⚠️ The Real-World Reason You Missed The Call:</div>
      <div class="trade-chips">
        <div class="chip">💈 Mid-fade with shears</div>
        <div class="chip">🚗 Foam cannon running</div>
        <div class="chip">✂️ Hair foil / chemical process</div>
        <div class="chip">🐾 Dog on grooming table</div>
        <div class="chip">🔧 Under a crawlspace</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-brand">MissedCall<span>AutoSMS</span></div>
    <div class="swipe-prompt">Swipe to see the annual math →</div>
  </div>
</body>
</html>`;

// Slide 2: The Annual Revenue Loss by Trade
const slide2Html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    height: 1350px;
    background: #080B10;
    color: #F0F6FC;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 70px 60px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }
  body::before {
    content: '';
    position: absolute;
    top: -120px;
    right: -120px;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, rgba(255, 179, 0, 0.10) 0%, transparent 70%);
  }

  .badge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    background: rgba(255, 179, 0, 0.12);
    border: 1px solid rgba(255, 179, 0, 0.35);
    color: #FFB300;
    padding: 10px 20px;
    border-radius: 999px;
    font-size: 20px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .slide-count { font-size: 20px; color: #8B949E; font-weight: 600; }

  .title-section { margin-top: 30px; }
  h1 {
    font-size: 56px;
    line-height: 1.15;
    font-weight: 900;
    color: #FFFFFF;
  }
  h1 span.warn {
    color: #FFB300;
  }
  p.subtitle {
    font-size: 26px;
    color: #8B949E;
    margin-top: 14px;
    line-height: 1.4;
  }

  /* Trade Math Grid */
  .trades-grid {
    display: flex;
    flex-direction: column;
    gap: 18px;
    margin: 36px 0;
  }
  .trade-row {
    background: #0F141C;
    border: 1px solid #21262D;
    border-radius: 18px;
    padding: 22px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .trade-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .trade-name {
    font-size: 26px;
    font-weight: 800;
    color: #FFFFFF;
  }
  .ticket-calc {
    font-size: 19px;
    color: #8B949E;
  }
  .loss-pill {
    text-align: right;
  }
  .loss-amount {
    font-size: 34px;
    font-weight: 900;
    color: #FF5252;
  }
  .loss-label {
    font-size: 16px;
    color: #8B949E;
    text-transform: uppercase;
    font-weight: 700;
  }

  /* Big Punchline Box */
  .punchline-box {
    background: linear-gradient(135deg, rgba(255, 82, 82, 0.08) 0%, rgba(255, 179, 0, 0.05) 100%);
    border: 1px solid rgba(255, 82, 82, 0.35);
    border-radius: 18px;
    padding: 26px 30px;
  }
  .punchline-text {
    font-size: 24px;
    font-weight: 700;
    color: #FFFFFF;
    line-height: 1.4;
  }
  .punchline-text span {
    color: #00E676;
  }

  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #21262D;
    padding-top: 24px;
  }
  .footer-brand { font-size: 22px; font-weight: 800; color: #FFFFFF; }
  .footer-brand span { color: #00E676; }
  .swipe-prompt { font-size: 20px; color: #8B949E; font-weight: 600; }
</style>
</head>
<body>
  <div>
    <div class="badge-row">
      <div class="badge">💸 The Cost of Silence</div>
      <div class="slide-count">02 / 03</div>
    </div>

    <div class="title-section">
      <h1>THE MATH OF <span class="warn">3 MISSED CALLS</span> PER WEEK</h1>
      <p class="subtitle">Assuming just 1 of those 3 callers went to a competitor who answered first (52 lost jobs / year):</p>
    </div>

    <div class="trades-grid">
      <div class="trade-row">
        <div class="trade-info">
          <div class="trade-name">🚗 Mobile Auto Detailing</div>
          <div class="ticket-calc">Avg Ticket: $350 • 1 Lost Job / Week</div>
        </div>
        <div class="loss-pill">
          <div class="loss-amount">-$18,200</div>
          <div class="loss-label">Annual Loss</div>
        </div>
      </div>

      <div class="trade-row">
        <div class="trade-info">
          <div class="trade-name">💇‍♀️ Salons & Colorists</div>
          <div class="ticket-calc">Avg Ticket: $180 • 1 Lost Job / Week</div>
        </div>
        <div class="loss-pill">
          <div class="loss-amount">-$9,360</div>
          <div class="loss-label">Annual Loss</div>
        </div>
      </div>

      <div class="trade-row">
        <div class="trade-info">
          <div class="trade-name">🐾 Pet Grooming Studios</div>
          <div class="ticket-calc">Avg Ticket: $95 • 1 Lost Job / Week</div>
        </div>
        <div class="loss-pill">
          <div class="loss-amount">-$4,940</div>
          <div class="loss-label">Annual Loss</div>
        </div>
      </div>

      <div class="trade-row">
        <div class="trade-info">
          <div class="trade-name">🔧 Plumbing & HVAC</div>
          <div class="ticket-calc">Avg Ticket: $750 • 1 Lost Job / Week</div>
        </div>
        <div class="loss-pill">
          <div class="loss-amount">-$39,000</div>
          <div class="loss-label">Annual Loss</div>
        </div>
      </div>
    </div>

    <div class="punchline-box">
      <div class="punchline-text">
        "Callers don't wait for your voicemail. They tap the next phone number on Google Maps until a human responds."
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-brand">MissedCall<span>AutoSMS</span></div>
    <div class="swipe-prompt">Swipe for the 15-second fix →</div>
  </div>
</body>
</html>`;

// Slide 3: The 15-Second Solution (Actionable Takeaway)
const slide3Html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    height: 1350px;
    background: #080B10;
    color: #F0F6FC;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 70px 60px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }
  body::before {
    content: '';
    position: absolute;
    top: -120px;
    right: -120px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(0, 230, 118, 0.15) 0%, transparent 70%);
  }

  .badge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    background: rgba(0, 230, 118, 0.12);
    border: 1px solid rgba(0, 230, 118, 0.35);
    color: #00E676;
    padding: 10px 20px;
    border-radius: 999px;
    font-size: 20px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .slide-count { font-size: 20px; color: #8B949E; font-weight: 600; }

  .title-section { margin-top: 30px; }
  h1 {
    font-size: 56px;
    line-height: 1.15;
    font-weight: 900;
    color: #FFFFFF;
  }
  h1 span.green { color: #00E676; }
  p.subtitle {
    font-size: 26px;
    color: #8B949E;
    margin-top: 14px;
    line-height: 1.4;
  }

  /* Mock Phone Conversation Screen */
  .chat-preview {
    background: #0D1117;
    border: 2px solid #21262D;
    border-radius: 24px;
    padding: 30px;
    margin: 36px 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.5);
  }
  .chat-status {
    font-size: 18px;
    color: #8B949E;
    text-align: center;
    font-weight: 600;
  }
  .bubble-received {
    background: #161B22;
    border: 1px solid #30363D;
    padding: 18px 22px;
    border-radius: 20px 20px 20px 4px;
    font-size: 22px;
    line-height: 1.4;
    color: #E6EDF3;
    max-width: 85%;
  }
  .bubble-sent {
    align-self: flex-end;
    background: linear-gradient(135deg, #00E676 0%, #00B4D8 100%);
    color: #080B10;
    font-weight: 700;
    padding: 18px 22px;
    border-radius: 20px 20px 4px 20px;
    font-size: 22px;
    line-height: 1.4;
    max-width: 85%;
  }
  .bubble-time {
    font-size: 14px;
    color: #8B949E;
    margin-top: 6px;
  }

  /* Benefits Row */
  .benefits-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 26px;
  }
  .benefit-card {
    background: #0F141C;
    border: 1px solid #21262D;
    border-radius: 16px;
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .benefit-icon {
    font-size: 28px;
  }
  .benefit-title {
    font-size: 20px;
    font-weight: 800;
    color: #FFFFFF;
  }
  .benefit-desc {
    font-size: 15px;
    color: #8B949E;
    line-height: 1.35;
  }

  /* Bottom Takeaway */
  .cta-card {
    background: #0F141C;
    border: 1px solid rgba(0, 230, 118, 0.4);
    border-radius: 20px;
    padding: 24px 30px;
    text-align: center;
  }
  .cta-headline {
    font-size: 26px;
    font-weight: 900;
    color: #FFFFFF;
  }
  .cta-sub {
    font-size: 18px;
    color: #8B949E;
    margin-top: 6px;
  }

  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #21262D;
    padding-top: 24px;
  }
  .footer-brand { font-size: 22px; font-weight: 800; color: #FFFFFF; }
  .footer-brand span { color: #00E676; }
  .save-prompt { font-size: 20px; color: #00E676; font-weight: 700; }
</style>
</head>
<body>
  <div>
    <div class="badge-row">
      <div class="badge">⚡ The 15-Second Solution</div>
      <div class="slide-count">03 / 03</div>
    </div>

    <div class="title-section">
      <h1>NEVER DROP YOUR TOOLS.<br><span class="green">JUST AUTO-TEXT IN 15 SECONDS.</span></h1>
      <p class="subtitle">What happens when your phone catches the caller immediately:</p>
    </div>

    <div class="chat-preview">
      <div class="chat-status">📞 Inbound Call Missed (Hands are full on job)</div>
      <div class="bubble-received">
        "Hi! Sorry we missed your call—we're currently hands-on with a client right now. How can we help you today?"
        <div class="bubble-time">15 seconds after missed call • Sent automatically</div>
      </div>
      <div class="bubble-sent">
        "Hey! Looking to get my Tesla detailed this Thursday. Do you have any openings?"
      </div>
    </div>

    <div class="benefits-row">
      <div class="benefit-card">
        <div class="benefit-icon">🛑</div>
        <div class="benefit-title">Stops The Search</div>
        <div class="benefit-desc">The caller gets an instant reply and immediately stops calling other businesses.</div>
      </div>
      <div class="benefit-card">
        <div class="benefit-icon">🛠️</div>
        <div class="benefit-title">Zero Interruption</div>
        <div class="benefit-desc">Keep your hands on the shears, torch, or polisher without breaking focus.</div>
      </div>
      <div class="benefit-card">
        <div class="benefit-icon">📅</div>
        <div class="benefit-title">Book On Your Terms</div>
        <div class="benefit-desc">Client texts details so you can review and confirm when your hands are free.</div>
      </div>
    </div>

    <div class="cta-card">
      <div class="cta-headline">SAVE THIS POST 📌</div>
      <div class="cta-sub">What is your biggest obstacle to answering customer calls during the day? Share below 👇</div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-brand">MissedCall<span>AutoSMS</span></div>
    <div class="save-prompt">Bookmark for your trade business 🔖</div>
  </div>
</body>
</html>`;

const slides = [
  { name: 'prototype_carousel_slide1_dropoff.png', html: slide1Html },
  { name: 'prototype_carousel_slide2_trade_math.png', html: slide2Html },
  { name: 'prototype_carousel_slide3_solution.png', html: slide3Html }
];

console.log('====================================================');
console.log('🎨 RENDERING FORMAT C: INFOGRAPHIC CAROUSEL PROTOTYPE');
console.log('====================================================');

slides.forEach((s, idx) => {
  const tempHtmlPath = path.join(outDir, `temp_slide_${idx + 1}.html`);
  const outPngPath = path.join(outDir, s.name);
  fs.writeFileSync(tempHtmlPath, s.html, 'utf8');

  const cmd = `"${chromePath}" --headless --disable-gpu --screenshot="${outPngPath}" --window-size=1080,1350 "file:///${tempHtmlPath.replace(/\\/g, '/')}"`;
  
  const t0 = Date.now();
  execSync(cmd, { stdio: 'ignore' });
  console.log(`✓ Rendered Slide ${idx + 1}: ${s.name} (${fs.statSync(outPngPath).size} bytes, ${Date.now() - t0}ms)`);

  // Clean up temp html
  try { fs.unlinkSync(tempHtmlPath); } catch (e) {}
});

console.log('\n🎉 ALL 3 CAROUSEL SLIDES SUCCESSFULLY GENERATED!');
console.log(`Output Directory: ${outDir}`);
